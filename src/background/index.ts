import { encrypt, decrypt } from "~/lib/wallet/encryption"
import { generateMnemonic, deriveWallets, importPrivateKey } from "~/lib/wallet/keyring"
import { saveKeystore, loadKeystore, deleteKeystore } from "~/lib/storage/keystore"
import { getBalances, initAlchemyRpc, getProvider, withRetry, makeProvider, clearRpcCooldowns } from "~/lib/chain/provider"
import { buildFeeData } from "~/lib/chain/gas"
import { explainTxError } from "~/lib/chain/errors"
import { Wallet, JsonRpcProvider, parseEther, formatEther } from "ethers"
import { setUserApiKey, getUserApiKeys, clearAlchemyThrottles } from "~/lib/api/keys"
import { fundSubWallets, consolidateETH, type ProgressCallback } from "~/lib/tx/engine"
import { addActivity, getActivity } from "~/lib/storage/activity"
import { storageGet, storageSet, storageRemove } from "~/lib/storage/chrome-storage"
import { fetchContractABI } from "~/lib/nft/etherscan"
import { detectMintFunctions, detectMintPrice, probeMintSelectors } from "~/lib/mint/detector"
import { detectContract } from "~/lib/mint/detect"
import { executeMint, clearStuckTx } from "~/lib/mint/executor"
import { getNFTBalances, getContractInfo } from "~/lib/nft/balance"
import { consolidateNFTs } from "~/lib/consolidate/nft"
import { fetchAllBalances } from "~/lib/chain/balances"
import { getEthPriceUsd } from "~/lib/chain/price"
import { resolveStatus, redeemCode, deactivate, fetchEntitlements } from "~/lib/license/client"
import type { Message, Response, WalletsData } from "~/lib/messaging"
import type { EncryptedKeystore, DerivedWallet, WalletInfo, MasterWalletEntry } from "~/lib/wallet/types"

function cleanError(e: unknown): string {
  return explainTxError(e)
}

interface VaultState {
  locked: boolean
  password: string | null
  masters: Array<{ id: string; label: string; mnemonic: string; wallets: DerivedWallet[] }>
  activeMasterId: string | null
  importedWallets: Array<{ address: string; privateKey: string; label: string }>
  disabledAddresses: Set<string>
}

const vault: VaultState = {
  locked: true,
  password: null,
  masters: [],
  activeMasterId: null,
  importedWallets: [],
  disabledAddresses: new Set(),
}

const MAX_WALLETS = 100

let unlockAttempts = 0
let unlockCooldownUntil = 0
let lastBalanceFetch = 0
const BALANCE_COOLDOWN_MS = 15_000
let cachedBalances: { balances: Record<string, import("~/lib/wallet/types").AggregatedBalances>; ethPriceUsd: number; fetchedAt: number } | null = null
const UNLOCK_THROTTLE_KEY = "savantsnipor_unlock_throttle"

interface UnlockThrottleState {
  attempts: number
  cooldownUntil: number
}

function broadcastToPopup(event: { type: string; [key: string]: unknown }): void {
  chrome.runtime.sendMessage(event).catch(() => {})
}

async function loadUnlockThrottle(): Promise<UnlockThrottleState> {
  const stored = await chrome.storage.session.get(UNLOCK_THROTTLE_KEY)
  const raw = stored[UNLOCK_THROTTLE_KEY] as Partial<UnlockThrottleState> | undefined
  unlockAttempts = typeof raw?.attempts === "number" ? raw.attempts : 0
  unlockCooldownUntil = typeof raw?.cooldownUntil === "number" ? raw.cooldownUntil : 0
  return { attempts: unlockAttempts, cooldownUntil: unlockCooldownUntil }
}

async function saveUnlockThrottle(): Promise<void> {
  await chrome.storage.session.set({
    [UNLOCK_THROTTLE_KEY]: { attempts: unlockAttempts, cooldownUntil: unlockCooldownUntil } satisfies UnlockThrottleState,
  })
}

async function clearUnlockThrottle(): Promise<void> {
  unlockAttempts = 0
  unlockCooldownUntil = 0
  await chrome.storage.session.remove(UNLOCK_THROTTLE_KEY)
}

async function recordFailedUnlock(): Promise<void> {
  unlockAttempts++
  if (unlockAttempts >= 10) {
    unlockCooldownUntil = Date.now() + 5 * 60 * 1000
  } else if (unlockAttempts >= 5) {
    unlockCooldownUntil = Date.now() + 30 * 1000
  }
  await saveUnlockThrottle()
}

function getWalletInfos(): WalletInfo[] {
  const wallets: WalletInfo[] = []
  const activeMaster = vault.masters.find((m) => m.id === vault.activeMasterId)

  if (activeMaster) {
    for (const w of activeMaster.wallets) {
      wallets.push({
        address: w.address,
        label: w.index === 0 ? `${activeMaster.label}` : `Sub ${w.index}`,
        type: w.index === 0 ? "hd-master" : "hd-sub",
        index: w.index,
        enabled: !vault.disabledAddresses.has(w.address.toLowerCase()),
      })
    }
  }

  for (const w of vault.importedWallets) {
    wallets.push({
      address: w.address,
      label: w.label,
      type: "imported",
      enabled: !vault.disabledAddresses.has(w.address.toLowerCase()),
    })
  }
  return wallets
}

const LOCK_ALARM = "auto-lock"
const LOCK_MINUTES = 15

function lockVault(): void {
  vault.locked = true
  vault.password = null
  vault.masters = []
  vault.activeMasterId = null
  vault.importedWallets = []
  vault.disabledAddresses = new Set()
  chrome.storage.session.remove("_sp")
  chrome.alarms.clear(LOCK_ALARM)
}

function resetLockTimer(): void {
  if (!vault.locked) {
    chrome.alarms.create(LOCK_ALARM, { delayInMinutes: LOCK_MINUTES })
  }
}

async function storeSessionPassword(password: string): Promise<void> {
  await chrome.storage.session.set({ _sp: password })
}

async function tryAutoUnlock(): Promise<void> {
  try {
    const { _sp } = await chrome.storage.session.get("_sp")
    if (_sp && typeof _sp === "string") {
      const result = await unlockVault(_sp)
      if (result.ok) resetLockTimer()
    }
  } catch {}
}

async function unlockVault(password: string): Promise<Response> {
  await loadUnlockThrottle()
  const now = Date.now()
  if (now < unlockCooldownUntil) {
    const secsLeft = Math.ceil((unlockCooldownUntil - now) / 1000)
    return { ok: false, error: `Too many attempts. Try again in ${secsLeft}s` }
  }

  const keystore = await loadKeystore()
  if (!keystore) return { ok: false, error: "No wallet found" }

  try {
    vault.masters = []
    // Removed sub-wallets are filtered out of the vault entirely, so mint /
    // fund / export-all lookups can never touch them. Derivation is
    // deterministic; re-importing the seed elsewhere restores access.
    const removed = new Set((keystore.removedAddresses ?? []).map((a) => a.toLowerCase()))
    for (const master of keystore.masters) {
      const mnemonic = await decrypt(master.encryptedMnemonic, password)
      const wallets = deriveWallets(mnemonic, master.derivedCount).filter(
        (w) => !removed.has(w.address.toLowerCase())
      )
      vault.masters.push({ id: master.id, label: master.label, mnemonic, wallets })
    }

    vault.importedWallets = []
    for (const entry of keystore.importedKeys) {
      const pk = await decrypt(entry.encryptedKey, password)
      vault.importedWallets.push({ address: entry.address, privateKey: pk, label: entry.label })
    }

    vault.activeMasterId = keystore.activeMasterId
    vault.disabledAddresses = new Set(keystore.disabledAddresses.map((a) => a.toLowerCase()))
    vault.password = password
    vault.locked = false
    await clearUnlockThrottle()
    initAlchemyRpc().catch(() => {})
    await storeSessionPassword(password)
    resetLockTimer()
    const stored = await storageGet<typeof cachedBalances>("savantsnipor_balances")
    if (stored) cachedBalances = stored
    const walletInfos = getWalletInfos()
    if (cachedBalances) {
      for (const w of walletInfos) {
        const bal = cachedBalances.balances[w.address]
        if (bal) { w.balance = bal.totalEth.toFixed(6); w.balances = bal }
      }
    }
    return { ok: true, data: { wallets: walletInfos, locked: false, cachedEthPriceUsd: cachedBalances?.ethPriceUsd ?? 0, balanceFetchedAt: cachedBalances?.fetchedAt ?? 0 } }
  } catch {
    await recordFailedUnlock()
    return { ok: false, error: "Wrong password" }
  }
}

function getTotalWalletCount(): number {
  let count = 0
  for (const m of vault.masters) count += m.wallets.length
  count += vault.importedWallets.length
  return count
}

async function createWallet(mnemonic: string, password: string, subWalletCount: number): Promise<Response> {
  if (subWalletCount > MAX_WALLETS) return { ok: false, error: `Maximum ${MAX_WALLETS} wallets allowed` }
  const encryptedMnemonic = await encrypt(mnemonic, password)
  const masterId = crypto.randomUUID()
  const master: MasterWalletEntry = {
    id: masterId,
    label: "Master",
    encryptedMnemonic,
    derivedCount: subWalletCount,
  }
  const keystore: EncryptedKeystore = {
    version: 2,
    masters: [master],
    activeMasterId: masterId,
    importedKeys: [],
    createdAt: Date.now(),
    disabledAddresses: [],
  }
  await saveKeystore(keystore)

  const wallets = deriveWallets(mnemonic, subWalletCount)
  vault.masters = [{ id: masterId, label: "Master", mnemonic, wallets }]
  vault.activeMasterId = masterId
  vault.importedWallets = []
  vault.disabledAddresses = new Set()
  vault.password = password
  vault.locked = false

  return { ok: true, data: { wallets: getWalletInfos(), locked: false } satisfies WalletsData }
}

async function importMnemonic(mnemonic: string, label: string, password: string, subWalletCount: number): Promise<Response> {
  const keystore = await loadKeystore()
  if (!keystore) return { ok: false, error: "No wallet found. Create one first." }

  try {
    const firstMaster = keystore.masters[0]
    if (firstMaster) await decrypt(firstMaster.encryptedMnemonic, password)
  } catch {
    return { ok: false, error: "Wrong password" }
  }

  if (getTotalWalletCount() + subWalletCount > MAX_WALLETS) return { ok: false, error: `Maximum ${MAX_WALLETS} wallets allowed` }

  const encryptedMnemonic = await encrypt(mnemonic, password)
  const masterId = crypto.randomUUID()
  const master: MasterWalletEntry = { id: masterId, label, encryptedMnemonic, derivedCount: subWalletCount }
  keystore.masters.push(master)
  await saveKeystore(keystore)

  const wallets = deriveWallets(mnemonic, subWalletCount)
  vault.masters.push({ id: masterId, label, mnemonic, wallets })

  return { ok: true, data: { wallets: getWalletInfos(), locked: false } satisfies WalletsData }
}

async function importKey(privateKey: string, label: string, password: string): Promise<Response> {
  const keystore = await loadKeystore()
  if (!keystore) return { ok: false, error: "No wallet found. Create one first." }

  try {
    const firstMaster = keystore.masters[0]
    if (firstMaster) await decrypt(firstMaster.encryptedMnemonic, password)
  } catch {
    return { ok: false, error: "Wrong password" }
  }

  if (getTotalWalletCount() + 1 > MAX_WALLETS) return { ok: false, error: `Maximum ${MAX_WALLETS} wallets allowed` }

  const { address } = importPrivateKey(privateKey)
  const encryptedKey = await encrypt(privateKey, password)
  keystore.importedKeys.push({ id: crypto.randomUUID(), label, address, encryptedKey })
  await saveKeystore(keystore)

  vault.importedWallets.push({ address, privateKey, label })
  return { ok: true, data: { wallets: getWalletInfos(), locked: false } satisfies WalletsData }
}

async function setMaster(masterId: string): Promise<Response> {
  const keystore = await loadKeystore()
  if (!keystore) return { ok: false, error: "No wallet found" }

  const exists = keystore.masters.some((m) => m.id === masterId)
  if (!exists) return { ok: false, error: "Master wallet not found" }

  keystore.activeMasterId = masterId
  await saveKeystore(keystore)
  vault.activeMasterId = masterId

  return { ok: true, data: { wallets: getWalletInfos(), locked: false } satisfies WalletsData }
}

async function toggleWallet(address: string, enabled: boolean): Promise<Response> {
  const keystore = await loadKeystore()
  if (!keystore) return { ok: false, error: "No wallet found" }

  const lower = address.toLowerCase()
  if (enabled) {
    keystore.disabledAddresses = keystore.disabledAddresses.filter((a) => a.toLowerCase() !== lower)
    vault.disabledAddresses.delete(lower)
  } else {
    if (!keystore.disabledAddresses.includes(lower)) keystore.disabledAddresses.push(lower)
    vault.disabledAddresses.add(lower)
  }
  await saveKeystore(keystore)

  return { ok: true, data: { wallets: getWalletInfos(), locked: false } satisfies WalletsData }
}

async function deriveMore(count: number, password: string): Promise<Response> {
  if (getTotalWalletCount() + count > MAX_WALLETS) return { ok: false, error: `Maximum ${MAX_WALLETS} wallets allowed` }

  const keystore = await loadKeystore()
  if (!keystore) return { ok: false, error: "No wallet found" }

  const activeMaster = keystore.masters.find((m) => m.id === keystore.activeMasterId)
  if (!activeMaster) return { ok: false, error: "No active master wallet" }

  try {
    const mnemonic = await decrypt(activeMaster.encryptedMnemonic, password)
    activeMaster.derivedCount += count
    await saveKeystore(keystore)

    const vaultMaster = vault.masters.find((m) => m.id === keystore.activeMasterId)
    if (vaultMaster) {
      vaultMaster.wallets = deriveWallets(mnemonic, activeMaster.derivedCount)
    }
    return { ok: true, data: { wallets: getWalletInfos(), locked: false } satisfies WalletsData }
  } catch {
    return { ok: false, error: "Wrong password" }
  }
}

async function exportKey(address: string, password: string): Promise<Response> {
  const keystore = await loadKeystore()
  if (!keystore) return { ok: false, error: "No wallet found" }

  try {
    const firstMaster = keystore.masters[0]
    if (firstMaster) await decrypt(firstMaster.encryptedMnemonic, password)
  } catch {
    return { ok: false, error: "Wrong password" }
  }

  const lower = address.toLowerCase()
  for (const master of vault.masters) {
    const hd = master.wallets.find((w) => w.address.toLowerCase() === lower)
    if (hd) return { ok: true, data: { privateKey: hd.privateKey } }
  }

  const imp = vault.importedWallets.find((w) => w.address.toLowerCase() === lower)
  if (imp) return { ok: true, data: { privateKey: imp.privateKey } }

  return { ok: false, error: "Wallet not found" }
}

async function changePassword(oldPassword: string, newPassword: string): Promise<Response> {
  const keystore = await loadKeystore()
  if (!keystore) return { ok: false, error: "No wallet found" }

  try {
    for (const master of keystore.masters) {
      const mnemonic = await decrypt(master.encryptedMnemonic, oldPassword)
      master.encryptedMnemonic = await encrypt(mnemonic, newPassword)
    }

    keystore.importedKeys = await Promise.all(
      keystore.importedKeys.map(async (entry) => ({
        ...entry,
        encryptedKey: await encrypt(await decrypt(entry.encryptedKey, oldPassword), newPassword),
      }))
    )
    await saveKeystore(keystore)
    vault.password = newPassword
    return { ok: true }
  } catch {
    return { ok: false, error: "Wrong password" }
  }
}

// Removes a wallet from the app. HD subs: recorded in removedAddresses (the
// seed can always re-derive them elsewhere). Imported keys: entry is deleted
// outright — without the user's own PK backup that key is gone for good. The
// master wallet (index 0) can never be removed. Password-confirmed.
async function removeWallet(address: string, password: string): Promise<Response> {
  if (vault.locked || !vault.password) return { ok: false, error: "Unlock first" }
  if (password !== vault.password) return { ok: false, error: "Wrong password" }

  const keystore = await loadKeystore()
  if (!keystore) return { ok: false, error: "No wallet found" }
  const lower = address.toLowerCase()

  for (const master of vault.masters) {
    const hd = master.wallets.find((w) => w.address.toLowerCase() === lower)
    if (hd) {
      if (hd.index === 0) return { ok: false, error: "The master wallet can't be removed" }
      keystore.removedAddresses = [...(keystore.removedAddresses ?? []), lower]
      keystore.disabledAddresses = keystore.disabledAddresses.filter((a) => a.toLowerCase() !== lower)
      await saveKeystore(keystore)
      master.wallets = master.wallets.filter((w) => w.address.toLowerCase() !== lower)
      vault.disabledAddresses.delete(lower)
      return { ok: true }
    }
  }

  const imp = vault.importedWallets.find((w) => w.address.toLowerCase() === lower)
  if (imp) {
    keystore.importedKeys = keystore.importedKeys.filter((e) => e.address.toLowerCase() !== lower)
    keystore.disabledAddresses = keystore.disabledAddresses.filter((a) => a.toLowerCase() !== lower)
    await saveKeystore(keystore)
    vault.importedWallets = vault.importedWallets.filter((w) => w.address.toLowerCase() !== lower)
    vault.disabledAddresses.delete(lower)
    return { ok: true }
  }

  return { ok: false, error: "Wallet not found" }
}

async function handleMessage(msg: Message): Promise<Response> {
  switch (msg.type) {
    case "GENERATE_MNEMONIC": return { ok: true, data: { mnemonic: generateMnemonic() } }
    case "UNLOCK": return unlockVault(msg.payload.password)
    case "LOCK": lockVault(); return { ok: true }
    case "CREATE_WALLET": return createWallet(msg.payload.mnemonic, msg.payload.password, msg.payload.subWalletCount)
    case "IMPORT_MNEMONIC": return importMnemonic(msg.payload.mnemonic, msg.payload.label, msg.payload.password, msg.payload.subWalletCount)
    case "IMPORT_KEY": return importKey(msg.payload.privateKey, msg.payload.label, msg.payload.password)
    case "DERIVE_MORE": return deriveMore(msg.payload.count, msg.payload.password)
    case "GET_WALLETS": {
      const walletInfos = getWalletInfos()
      if (!vault.locked && !cachedBalances) {
        const stored = await storageGet<typeof cachedBalances>("savantsnipor_balances")
        if (stored) cachedBalances = stored
      }
      if (cachedBalances) {
        for (const w of walletInfos) {
          const bal = cachedBalances.balances[w.address]
          if (bal) {
            w.balance = bal.totalEth.toFixed(6)
            w.balances = bal
          }
        }
      }
      return { ok: true, data: { wallets: walletInfos, locked: vault.locked, cachedEthPriceUsd: cachedBalances?.ethPriceUsd ?? 0, balanceFetchedAt: cachedBalances?.fetchedAt ?? 0 } }
    }
    case "SET_MASTER": return setMaster(msg.payload.masterId)
    case "TOGGLE_WALLET": return toggleWallet(msg.payload.address, msg.payload.enabled)
    case "EXPORT_KEY": return exportKey(msg.payload.address, msg.payload.password)
    case "CHANGE_PASSWORD": return changePassword(msg.payload.oldPassword, msg.payload.newPassword)
    case "SET_API_KEYS":
      await setUserApiKey(msg.payload.service as "opensea" | "etherscan" | "alchemy", msg.payload.key)
      if (msg.payload.service === "alchemy") await initAlchemyRpc()
      return { ok: true }
    case "GET_API_KEYS":
      return { ok: true, data: await getUserApiKeys() }
    case "GET_BALANCES":
      try {
        const allAddresses: string[] = []
        for (const master of vault.masters) {
          if (master.id === vault.activeMasterId) {
            allAddresses.push(...master.wallets.map((w) => w.address))
          }
        }
        allAddresses.push(...vault.importedWallets.map((w) => w.address))
        const balances = await getBalances(msg.payload.chainId, allAddresses)
        return { ok: true, data: balances }
      } catch (e) {
        return { ok: false, error: cleanError(e) }
      }
    case "FUND_SUBWALLETS": {
      const activeMaster = vault.masters.find((m) => m.id === vault.activeMasterId)
      if (!activeMaster) return { ok: false, error: "No active master wallet" }

      let fundingKey: string | undefined
      const fromAddr = msg.payload.fromAddress?.toLowerCase()

      if (fromAddr) {
        const hdMatch = activeMaster.wallets.find((w) => w.address.toLowerCase() === fromAddr)
        if (hdMatch) {
          fundingKey = hdMatch.privateKey
        } else {
          const impMatch = vault.importedWallets.find((w) => w.address.toLowerCase() === fromAddr)
          if (impMatch) fundingKey = impMatch.privateKey
        }
      } else {
        fundingKey = activeMaster.wallets[0]?.privateKey
      }

      if (!fundingKey) return { ok: false, error: "Funding wallet not found" }

      const targetAddrs = msg.payload.addresses.length > 0
        ? msg.payload.addresses.filter((a) => a.toLowerCase() !== fromAddr)
        : [
            ...activeMaster.wallets
              .filter((w) => w.address.toLowerCase() !== fromAddr && !vault.disabledAddresses.has(w.address.toLowerCase()))
              .map((w) => w.address),
            ...vault.importedWallets
              .filter((w) => w.address.toLowerCase() !== fromAddr && !vault.disabledAddresses.has(w.address.toLowerCase()))
              .map((w) => w.address),
          ]

      if (targetAddrs.length === 0) return { ok: false, error: "No sub-wallets to fund" }

      try {
        const onProgress: ProgressCallback = (current, total) => {
          broadcastToPopup({ type: "TX_PROGRESS", current, total, label: "Dispersing..." })
        }
        const results = await fundSubWallets(
          msg.payload.chainId,
          fundingKey,
          targetAddrs,
          msg.payload.amountPerWallet,
          msg.payload.speed,
          onProgress
        )
        for (const r of results) {
          await addActivity({
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            chainId: msg.payload.chainId,
            type: "disperse",
            contractAddress: "",
            walletAddress: r.from,
            txHash: r.hash || undefined,
            status: r.status,
            gasUsed: r.gasUsed,
            value: msg.payload.amountPerWallet,
            error: r.error,
          })
        }
        broadcastToPopup({ type: "ACTIVITY_ADDED" })
        const succeeded = results.filter((r) => r.status === "confirmed").length
        const failed = results.filter((r) => r.status === "failed").length
        return { ok: true, data: { succeeded, failed, total: results.length, results } }
      } catch (e) {
        return { ok: false, error: cleanError(e) }
      }
    }
    case "CONSOLIDATE": {
      const activeMaster = vault.masters.find((m) => m.id === vault.activeMasterId)
      if (!activeMaster) return { ok: false, error: "No active master wallet" }
      const masterAddr = activeMaster.wallets[0]?.address
      if (!masterAddr) return { ok: false, error: "No master wallet" }

      const subKeys = activeMaster.wallets
        .filter((w) => w.index > 0 && !vault.disabledAddresses.has(w.address.toLowerCase()))
        .map((w) => ({ address: w.address, privateKey: w.privateKey }))

      const importedKeys = vault.importedWallets
        .filter((w) => !vault.disabledAddresses.has(w.address.toLowerCase()))
        .map((w) => ({ address: w.address, privateKey: w.privateKey }))

      const allKeys = [...subKeys, ...importedKeys]
      if (allKeys.length === 0) return { ok: false, error: "No wallets to consolidate from" }

      try {
        const onConsolidateProgress: ProgressCallback = (current, total) => {
          broadcastToPopup({ type: "TX_PROGRESS", current, total, label: "Consolidating..." })
        }
        const results = await consolidateETH(msg.payload.chainId, allKeys, masterAddr, msg.payload.speed, onConsolidateProgress)
        for (const r of results) {
          await addActivity({
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            chainId: msg.payload.chainId,
            type: "consolidate",
            contractAddress: "",
            walletAddress: r.from,
            txHash: r.hash || undefined,
            status: r.status,
            gasUsed: r.gasUsed,
            value: undefined,
            error: r.error,
          })
        }
        broadcastToPopup({ type: "ACTIVITY_ADDED" })
        const succeeded = results.filter((r) => r.status === "confirmed").length
        const failed = results.filter((r) => r.status === "failed").length
        return { ok: true, data: { succeeded, failed, total: results.length, results } }
      } catch (e) {
        return { ok: false, error: cleanError(e) }
      }
    }
    case "EXPORT_ALL_KEYS": {
      if (!vault.password) return { ok: false, error: "Wallet is locked" }
      const keystore = await loadKeystore()
      if (!keystore) return { ok: false, error: "No wallet found" }
      try {
        const firstMaster = keystore.masters[0]
        if (firstMaster) await decrypt(firstMaster.encryptedMnemonic, msg.payload.password)
      } catch {
        return { ok: false, error: "Wrong password" }
      }
      const allWallets: Array<{ address: string; privateKey: string; label: string }> = []
      for (const master of vault.masters) {
        for (const w of master.wallets) {
          allWallets.push({
            address: w.address,
            privateKey: w.privateKey,
            label: w.index === 0 ? master.label : `Sub ${w.index}`,
          })
        }
      }
      for (const w of vault.importedWallets) {
        allWallets.push(w)
      }
      return { ok: true, data: { keys: allWallets.map((w) => ({ address: w.address, privateKey: w.privateKey, label: w.label })) } }
    }
    case "EXPORT_MNEMONIC": {
      if (!vault.password) return { ok: false, error: "Wallet is locked" }
      const keystore = await loadKeystore()
      if (!keystore) return { ok: false, error: "No wallet found" }
      try {
        const firstMaster = keystore.masters[0]
        if (firstMaster) await decrypt(firstMaster.encryptedMnemonic, msg.payload.password)
      } catch {
        return { ok: false, error: "Wrong password" }
      }
      const activeMaster = vault.masters.find((m) => m.id === vault.activeMasterId)
      if (!activeMaster) return { ok: false, error: "No active master wallet" }
      return { ok: true, data: { mnemonic: activeMaster.mnemonic } }
    }
    case "GET_ACTIVITY": {
      try {
        const entries = await getActivity()
        return { ok: true, data: entries }
      } catch (e) {
        return { ok: false, error: cleanError(e) }
      }
    }
    case "FETCH_ABI": {
      try {
        const abiJson = await fetchContractABI(msg.payload.chainId, msg.payload.contractAddress)
        return { ok: true, data: { abiJson } }
      } catch (e) {
        return { ok: false, error: cleanError(e) }
      }
    }
    case "DETECT_CONTRACT": {
      const caller =
        vault.masters[0]?.wallets[0]?.address ??
        vault.importedWallets[0]?.address ??
        "0x0000000000000000000000000000000000000001"
      try {
        const detection = await detectContract(
          msg.payload.chainId,
          msg.payload.contractAddress,
          caller,
          msg.payload.quantity || 1
        )
        return { ok: true, data: detection }
      } catch (e) {
        return { ok: false, error: cleanError(e) }
      }
    }
    case "DETECT_MINT_FUNCTIONS": {
      const functions = detectMintFunctions(msg.payload.abiJson)
      let mintPrice: string | null = null
      if (msg.payload.chainId && msg.payload.contractAddress) {
        try {
          mintPrice = await detectMintPrice(msg.payload.chainId, msg.payload.contractAddress, msg.payload.abiJson)
        } catch {}
      }
      const bestIndex = functions.length > 0 ? 0 : -1
      return { ok: true, data: { functions, bestIndex, mintPrice } }
    }
    case "PROBE_MINT_SELECTORS": {
      const callerAddr = vault.masters[0]?.wallets[0]?.address ?? "0x0000000000000000000000000000000000000001"
      try {
        const functions = await probeMintSelectors(msg.payload.chainId, msg.payload.contractAddress, callerAddr)
        let mintPrice: string | null = null
        try {
          mintPrice = await detectMintPrice(msg.payload.chainId, msg.payload.contractAddress)
        } catch {}
        return { ok: true, data: { functions, bestIndex: functions.length > 0 ? 0 : -1, mintPrice, probed: true } }
      } catch (e) {
        return { ok: false, error: cleanError(e) }
      }
    }
    case "EXECUTE_MINT": {
      const walletKeys: Array<{ address: string; privateKey: string }> = []
      for (const addr of msg.payload.walletAddresses) {
        const lower = addr.toLowerCase()
        for (const master of vault.masters) {
          const w = master.wallets.find((w) => w.address.toLowerCase() === lower)
          if (w) { walletKeys.push({ address: w.address, privateKey: w.privateKey }); break }
        }
        const imp = vault.importedWallets.find((w) => w.address.toLowerCase() === lower)
        if (imp && !walletKeys.some((k) => k.address.toLowerCase() === lower)) {
          walletKeys.push({ address: imp.address, privateKey: imp.privateKey })
        }
      }
      if (walletKeys.length === 0) return { ok: false, error: "No matching wallets found" }

      try {
        clearAlchemyThrottles()
        clearRpcCooldowns()
        const results = await executeMint(
          {
            chainId: msg.payload.chainId,
            contractAddress: msg.payload.contractAddress,
            functionName: msg.payload.functionName,
            args: msg.payload.args,
            value: msg.payload.value,
            speed: msg.payload.speed,
            walletAddresses: msg.payload.walletAddresses,
            gasLimit: msg.payload.gasLimit,
          },
          walletKeys,
          msg.payload.abiJson,
          (current, total) => broadcastToPopup({ type: "TX_PROGRESS", current, total, label: "Minting..." })
        )
        for (const r of results) {
          await addActivity({
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            chainId: msg.payload.chainId,
            type: "mint",
            contractAddress: msg.payload.contractAddress,
            walletAddress: r.address,
            txHash: r.hash || undefined,
            status: r.status,
            gasUsed: r.gasUsed,
            value: msg.payload.value,
            error: r.error,
          })
        }
        broadcastToPopup({ type: "ACTIVITY_ADDED" })
        const succeeded = results.filter((r) => r.status === "confirmed").length
        const failed = results.filter((r) => r.status === "failed").length
        // Persist the outcome: a mint outlives the popup (MV3 closes it freely),
        // and without this the final summary is delivered to a dead popup and
        // lost. The panel rehydrates it on next open via GET_LAST_MINT.
        await storageSet("savantsnipor_last_mint", {
          finishedAt: Date.now(),
          chainId: msg.payload.chainId,
          contractAddress: msg.payload.contractAddress,
          succeeded,
          failed,
          total: results.length,
          results,
        })
        return { ok: true, data: { succeeded, failed, total: results.length, results } }
      } catch (e) {
        return { ok: false, error: cleanError(e) }
      }
    }
    case "GET_LAST_MINT": {
      const last = await storageGet<Record<string, unknown>>("savantsnipor_last_mint")
      return { ok: true, data: last ?? null }
    }
    case "CLEAR_STUCK_TX": {
      const walletKeys: Array<{ address: string; privateKey: string }> = []
      for (const addr of msg.payload.walletAddresses) {
        const lower = addr.toLowerCase()
        for (const master of vault.masters) {
          const w = master.wallets.find((w) => w.address.toLowerCase() === lower)
          if (w) { walletKeys.push({ address: w.address, privateKey: w.privateKey }); break }
        }
        const imp = vault.importedWallets.find((w) => w.address.toLowerCase() === lower)
        if (imp && !walletKeys.some((k) => k.address.toLowerCase() === lower)) {
          walletKeys.push({ address: imp.address, privateKey: imp.privateKey })
        }
      }
      if (walletKeys.length === 0) return { ok: false, error: "No matching wallets found" }

      const results = await Promise.all(
        walletKeys.map((wk) => clearStuckTx(msg.payload.chainId, wk))
      )
      const clearedCount = results.filter((r) => r.cleared).length
      return { ok: true, data: { cleared: clearedCount, total: results.length, results } }
    }
    case "GET_NFT_CONTRACT_INFO": {
      try {
        const info = await getContractInfo(msg.payload.chainId, msg.payload.contractAddress)
        return { ok: true, data: info }
      } catch (e) {
        return { ok: false, error: cleanError(e) }
      }
    }
    case "GET_NFT_BALANCES": {
      try {
        const allAddresses: string[] = []
        const activeMaster = vault.masters.find((m) => m.id === vault.activeMasterId)
        if (activeMaster) allAddresses.push(...activeMaster.wallets.map((w) => w.address))
        allAddresses.push(...vault.importedWallets.map((w) => w.address))
        const balances = await getNFTBalances(msg.payload.chainId, msg.payload.contractAddress, allAddresses)
        return { ok: true, data: { balances } }
      } catch (e) {
        return { ok: false, error: cleanError(e) }
      }
    }
    case "CONSOLIDATE_NFTS": {
      const activeMaster = vault.masters.find((m) => m.id === vault.activeMasterId)
      if (!activeMaster) return { ok: false, error: "No active master wallet" }

      const allAddresses = [
        ...activeMaster.wallets.map((w) => w.address),
        ...vault.importedWallets.map((w) => w.address),
      ]

      try {
        const balances = await getNFTBalances(msg.payload.chainId, msg.payload.contractAddress, allAddresses)
        const destLower = msg.payload.destination.toLowerCase()

        const transfers: Array<{ fromAddress: string; fromPrivateKey: string; tokenIds: number[] }> = []
        for (const bal of balances) {
          if (bal.count === 0 || bal.address.toLowerCase() === destLower) continue
          if (bal.tokenIds.length === 0) continue

          let pk: string | undefined
          for (const master of vault.masters) {
            const w = master.wallets.find((w) => w.address.toLowerCase() === bal.address.toLowerCase())
            if (w) { pk = w.privateKey; break }
          }
          if (!pk) {
            const imp = vault.importedWallets.find((w) => w.address.toLowerCase() === bal.address.toLowerCase())
            if (imp) pk = imp.privateKey
          }
          if (pk) transfers.push({ fromAddress: bal.address, fromPrivateKey: pk, tokenIds: bal.tokenIds })
        }

        if (transfers.length === 0) return { ok: false, error: "No NFTs to consolidate" }

        const results = await consolidateNFTs(
          msg.payload.chainId,
          msg.payload.contractAddress,
          transfers,
          msg.payload.destination,
          msg.payload.speed,
          (current, total) => broadcastToPopup({ type: "TX_PROGRESS", current, total, label: "Consolidating NFTs..." })
        )

        for (const r of results) {
          await addActivity({
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            chainId: msg.payload.chainId,
            type: "consolidate",
            contractAddress: msg.payload.contractAddress,
            walletAddress: r.from,
            txHash: r.hash || undefined,
            status: r.status,
            gasUsed: r.gasUsed,
            error: r.error,
          })
        }

        broadcastToPopup({ type: "ACTIVITY_ADDED" })
        const succeeded = results.filter((r) => r.status === "confirmed").length
        const failed = results.filter((r) => r.status === "failed").length
        return { ok: true, data: { succeeded, failed, total: results.length, results } }
      } catch (e) {
        return { ok: false, error: cleanError(e) }
      }
    }
    case "SEND_ETH": {
      const lower = msg.payload.fromAddress.toLowerCase()
      let pk: string | undefined
      for (const master of vault.masters) {
        const w = master.wallets.find((w) => w.address.toLowerCase() === lower)
        if (w) { pk = w.privateKey; break }
      }
      if (!pk) {
        const imp = vault.importedWallets.find((w) => w.address.toLowerCase() === lower)
        if (imp) pk = imp.privateKey
      }
      if (!pk) return { ok: false, error: "Wallet not found" }

      try {
        const chainId = msg.payload.chainId
        const { CHAINS: chainConfigs, RPC_FALLBACKS } = await import("~/lib/chain/chains")
        const { getApiKey: getKey } = await import("~/lib/api/keys")

        const ALCHEMY_NETS: Record<number, string> = { 1: "eth-mainnet", 8453: "base-mainnet", 42161: "arb-mainnet" }
        const alchemyKey = await getKey("alchemy")
        const rpcs: string[] = []
        if (alchemyKey && ALCHEMY_NETS[chainId]) {
          rpcs.push(`https://${ALCHEMY_NETS[chainId]}.g.alchemy.com/v2/${alchemyKey}`)
        }
        rpcs.push(...(RPC_FALLBACKS[chainId] ?? []))

        const speedMult = msg.payload.speed === "turbo" ? 2.0 : msg.payload.speed === "fast" ? 1.3 : 1.0
        const prioMult = msg.payload.speed === "turbo" ? 3.0 : msg.payload.speed === "fast" ? 1.5 : 1.0

        let prepared: {
          wallet: Wallet
          value: bigint
          nonce: number
          maxFeePerGas: bigint
          maxPriorityFeePerGas: bigint
        } | null = null
        let lastErr: Error | null = null
        for (const rpc of rpcs) {
          try {
            // makeProvider = 12s timeout + no internal 429 retry, so a dead RPC
            // fails over to the next in seconds instead of ethers' ~300s default.
            const p = makeProvider(rpc, chainId)
            const w = new Wallet(pk!, p)
            const fd = await p.getFeeData()
            const baseFee = fd.maxFeePerGas ?? fd.gasPrice ?? 0n
            const priority = fd.maxPriorityFeePerGas ?? 1_000_000_000n
            const mfpg = BigInt(Math.ceil(Number(baseFee) * speedMult))
            const mppfg = BigInt(Math.ceil(Number(priority) * prioMult))

            let value = parseEther(msg.payload.amount)
            const balance = await p.getBalance(msg.payload.fromAddress)
            const gasCost = 21000n * mfpg
            if (value + gasCost > balance) {
              value = balance - gasCost
              if (value <= 0n) {
                lastErr = new Error("Insufficient balance to cover gas")
                break
              }
            }
            const nonce = await p.getTransactionCount(msg.payload.fromAddress, "pending")
            prepared = { wallet: w, value, nonce, maxFeePerGas: mfpg, maxPriorityFeePerGas: mppfg }
            break
          } catch (e) {
            lastErr = e instanceof Error ? e : new Error(String(e))
            console.warn(`[SEND_ETH] RPC preflight failed: ${rpc.slice(0, 40)}... -> ${lastErr.message.slice(0, 80)}`)
            continue
          }
        }

        if (!prepared) {
          return { ok: false, error: lastErr ? cleanError(lastErr) : "All RPCs failed" }
        }

        const tx = await prepared.wallet.sendTransaction({
          to: msg.payload.toAddress,
          value: prepared.value,
          nonce: prepared.nonce,
          gasLimit: 21000n,
          maxFeePerGas: prepared.maxFeePerGas,
          maxPriorityFeePerGas: prepared.maxPriorityFeePerGas,
          type: 2,
        })

        let status: "pending" | "confirmed" | "failed" | "timeout" = "pending"
        let gasUsed: string | undefined
        let waitError: string | undefined
        try {
          const receipt = await tx.wait()
          status = receipt?.status === 1 ? "confirmed" : "failed"
          gasUsed = receipt?.gasUsed.toString()
          if (receipt?.status !== 1) waitError = "Transaction reverted on-chain"
        } catch (e) {
          status = "timeout"
          waitError = e instanceof Error ? e.message : "Transaction broadcast, receipt unavailable"
        }

        await addActivity({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          chainId,
          type: "send",
          contractAddress: "",
          walletAddress: msg.payload.fromAddress,
          txHash: tx.hash,
          status,
          gasUsed,
          value: msg.payload.amount,
          error: waitError,
        })
        broadcastToPopup({ type: "ACTIVITY_ADDED" })
        const explorerUrl = chainConfigs[chainId]?.explorerUrl ? `${chainConfigs[chainId].explorerUrl}/tx/${tx.hash}` : undefined
        return { ok: true, data: { hash: tx.hash, status, explorerUrl, error: waitError } }
      } catch (e) {
        return { ok: false, error: cleanError(e) }
      }
    }
    case "GET_ALL_BALANCES": {
      try {
        const now = Date.now()
        const force = msg.payload?.force
        if (force) {
          // Manual refresh = the user demanding a retry NOW. Stale key/endpoint
          // cooldowns from an earlier bad moment must not gate it.
          clearAlchemyThrottles()
          clearRpcCooldowns()
        }
        if (!force && cachedBalances && now - lastBalanceFetch < BALANCE_COOLDOWN_MS) {
          return { ok: true, data: { balances: cachedBalances.balances, ethPriceUsd: cachedBalances.ethPriceUsd, fromCache: true } }
        }
        const allAddresses: string[] = []
        const activeMaster = vault.masters.find((m) => m.id === vault.activeMasterId)
        if (activeMaster) allAddresses.push(...activeMaster.wallets.map((w) => w.address))
        allAddresses.push(...vault.importedWallets.map((w) => w.address))
        const ethPriceUsd = await getEthPriceUsd()
        const balances = await fetchAllBalances(allAddresses, ethPriceUsd)
        lastBalanceFetch = Date.now()
        cachedBalances = { balances, ethPriceUsd, fetchedAt: lastBalanceFetch }
        await storageSet("savantsnipor_balances", cachedBalances)
        return { ok: true, data: { balances, ethPriceUsd } }
      } catch (e) {
        return { ok: false, error: cleanError(e) }
      }
    }
    case "ESTIMATE_MAX_SEND": {
      try {
        const chainId = msg.payload.chainId
        const balance = await withRetry(chainId, () =>
          getProvider(chainId).getBalance(msg.payload.fromAddress)
        )
        const feeData = await withRetry(chainId, () => buildFeeData(chainId, msg.payload.speed))
        const gasCost = 21000n * feeData.maxFeePerGas
        const sendable = balance - gasCost
        const maxEth = sendable > 0n ? formatEther(sendable) : "0"
        return { ok: true, data: { maxEth, gasCostEth: formatEther(gasCost) } }
      } catch (e) {
        return { ok: false, error: cleanError(e) }
      }
    }
    case "SET_PANEL_MODE": {
      if (msg.payload.mode === "sidebar") {
        await chrome.action.setPopup({ popup: "" })
        await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
        await chrome.storage.local.set({ panelMode: "sidebar" })
      } else {
        await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
        await chrome.action.setPopup({ popup: "popup.html" })
        await chrome.storage.local.set({ panelMode: "popup" })
      }
      return { ok: true }
    }
    case "GET_PANEL_MODE": {
      const { panelMode } = await chrome.storage.local.get("panelMode")
      return { ok: true, data: { mode: panelMode || "popup" } }
    }
    case "REMOVE_WALLET":
      return removeWallet(msg.payload.address, msg.payload.password)
    case "RESET_WALLET": {
      // Irreversible full wipe of all wallet data on this device.
      try {
        await deleteKeystore()
        await storageRemove("savantsnipor_balances")
        await storageRemove("savantsnipor_activity")
        await storageRemove("savantsnipor_unlock_throttle")
        await chrome.storage.session.remove("_sp")
        cachedBalances = null
        lastBalanceFetch = 0
        lockVault()
        return { ok: true }
      } catch (e) {
        return { ok: false, error: cleanError(e) }
      }
    }
    case "RPC_OVERRIDE":
      return { ok: false, error: "Not yet implemented" }
    case "LICENSE_STATUS":
      return { ok: true, data: await resolveStatus() }
    case "LICENSE_REDEEM":
      return { ok: true, data: await redeemCode(msg.payload.code) }
    case "LICENSE_REFRESH":
      return { ok: true, data: await resolveStatus() }
    case "LICENSE_DEACTIVATE":
      await deactivate()
      return { ok: true }
    case "LICENSE_ENTITLEMENTS":
      return { ok: true, data: await fetchEntitlements() }
    default:
      return { ok: false, error: "Unknown message type" }
  }
}

// MV3 kills the idle service worker; a fresh one auto-unlocks from the session
// password, but that decrypt (PBKDF2 600k iterations) takes up to ~1s. Every
// message must WAIT for it — otherwise the first action after idle races the
// unlock and fails with "No active master wallet" / "No matching wallets"
// (classic symptom: errors once, works on the second click).
const startupReady: Promise<void> = tryAutoUnlock()

chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ ok: false, error: "Unauthorized" })
    return true
  }
  startupReady
    .then(() => {
      resetLockTimer()
      return handleMessage(msg)
    })
    .then(sendResponse)
  return true
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === LOCK_ALARM) lockVault()
})

// ---- Storage schema versioning -------------------------------------------
// Extension updates that change the shape of any savantsnipor_* storage key MUST
// bump this and add a migration step below. Without this, an update can silently
// brick existing installs (keystore fails to parse => wallet appears gone).
const STORAGE_SCHEMA_VERSION = 1
const SCHEMA_KEY = "savantsnipor_schema_version"

async function migrateStorage(): Promise<void> {
  const current = (await storageGet<number>(SCHEMA_KEY)) ?? 1
  // Future migrations go here, stepwise:
  // if (current < 2) { ...transform keys...; }
  if (current !== STORAGE_SCHEMA_VERSION) {
    await storageSet(SCHEMA_KEY, STORAGE_SCHEMA_VERSION)
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    storageSet(SCHEMA_KEY, STORAGE_SCHEMA_VERSION).catch(() => {})
  } else if (details.reason === "update") {
    migrateStorage().catch(() => {})
  }
})

chrome.storage.local.get("panelMode").then(({ panelMode }) => {
  if (panelMode === "sidebar") {
    chrome.action.setPopup({ popup: "" })
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  }
})
