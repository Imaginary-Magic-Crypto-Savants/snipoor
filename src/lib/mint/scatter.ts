// Scatter.art API resolver.
//
// Purpose: for a Scatter (Archetype) drop, find which invite lists each of the
// user's wallets qualifies for (public AND allowlist) and produce the per-wallet
// mint() arguments — including the merkle proof for allowlisted wallets.
//
// TRUST MODEL (important): Scatter's POST /mint returns a fully-assembled tx
// (to/value/data). We do NOT broadcast that blob. Foreign calldata could tell a
// wallet to do anything, so we only DECODE it to extract the (key, proof) an
// allowlist mint needs, VALIDATE every field against independently-fetched list
// metadata + the known Archetype ABI, then RE-ENCODE the mint ourselves through
// the hardened executor. Proof from Scatter; transaction built and checked here.
import { Interface, parseEther, getAddress, solidityPackedKeccak256 } from "ethers"

const API_BASE = "https://api.scatter.art/v1"
const ZERO = "0x0000000000000000000000000000000000000000"
const SEL_ARCHETYPE_MINT = "0x4a21a2df"

// mint((bytes32 key, bytes32[] proof) auth, uint256 quantity, address affiliate, bytes signature)
const MINT_IFACE = new Interface([
  "function mint((bytes32 key, bytes32[] proof) auth, uint256 quantity, address affiliate, bytes signature) payable",
])

// ABI the executor uses to RE-ENCODE the mint (never Scatter's raw calldata).
export const ARCHETYPE_MINT_ABI_JSON = JSON.stringify([
  {
    type: "function",
    name: "mint",
    stateMutability: "payable",
    inputs: [
      { name: "auth", type: "tuple", components: [{ name: "key", type: "bytes32" }, { name: "proof", type: "bytes32[]" }] },
      { name: "quantity", type: "uint256" },
      { name: "affiliate", type: "address" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
])

export interface ScatterList {
  id: string
  root: string
  name: string
  priceEth: string
  currencySymbol: string
  isEth: boolean
  startTime: number // unix seconds, 0 if unset
  endTime: number // unix seconds, 0 = open-ended
  walletLimit: number // 0 = unlimited
  unitSize: number
  /** True when the list is unconditionally public (key <= 0xff or keccak(token)) — mintable with no proof. */
  isPublic: boolean
}

interface RawList {
  id: string
  root: string
  address: string
  name: string
  currency_address: string
  currency_symbol: string
  token_price: string
  decimals: number
  start_time: string | null
  end_time: string | null
  wallet_limit: number
  list_limit: number
  unit_size: number
}

const UINT32_MAX = 4294967295

// Pulls a collection slug from a pasted scatter.art URL or a bare slug.
// Accepts: "toxik-kidz", "scatter.art/toxik-kidz", "https://www.scatter.art/toxik-kidz?x=1".
export function slugFromInput(input: string): string | null {
  const s = input.trim()
  if (!s) return null
  let slug = s
  const m = s.match(/scatter\.art\/([^/?#\s]+)/i)
  if (m) slug = m[1]
  // A slug is a single path segment of url-safe chars — reject anything with a
  // slash/space left, or an 0x address (the API has no address lookup).
  slug = slug.replace(/^\/+|\/+$/g, "")
  if (!slug || /[/\s]/.test(slug) || /^0x[0-9a-fA-F]{40}$/.test(slug)) return null
  return slug
}

function isoToUnix(s: string | null): number {
  if (!s) return 0
  const t = Date.parse(s)
  return Number.isNaN(t) ? 0 : Math.floor(t / 1000)
}

// A list is unconditionally public per Archetype verify(): key <= 0xff, or
// key == keccak256(tokenAddress). Everything else is an allowlist (needs proof).
function isPublicKey(root: string, tokenAddress: string): boolean {
  try {
    if (BigInt(root) <= 0xffn) return true
  } catch {}
  return root.toLowerCase() === solidityPackedKeccak256(["address"], [getAddress(tokenAddress)]).toLowerCase()
}

function toScatterList(raw: RawList, contractAddress: string): ScatterList {
  return {
    id: raw.id,
    root: raw.root,
    name: raw.name,
    priceEth: raw.token_price,
    currencySymbol: raw.currency_symbol,
    isEth: raw.currency_address.toLowerCase() === ZERO,
    startTime: isoToUnix(raw.start_time),
    endTime: isoToUnix(raw.end_time),
    walletLimit: raw.wallet_limit >= UINT32_MAX ? 0 : raw.wallet_limit,
    unitSize: raw.unit_size || 1,
    isPublic: isPublicKey(raw.root, contractAddress),
  }
}

async function getJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Scatter API ${res.status}${body ? `: ${body.slice(0, 120)}` : ""}`)
  }
  return res.json()
}

// Lists a single wallet is eligible for (public lists always included; allowlist
// lists only when the wallet is a merkle-tree member — the server checks).
export async function fetchEligibleLists(
  slug: string,
  contractAddress: string,
  minter?: string
): Promise<ScatterList[]> {
  const url = `${API_BASE}/collection/${encodeURIComponent(slug)}/eligible-invite-lists${minter ? `?minterAddress=${minter}` : ""}`
  const data = (await getJson(url)) as RawList[]
  if (!Array.isArray(data)) return []
  return data.map((r) => toScatterList(r, contractAddress))
}

export interface WalletEligibility {
  list: ScatterList
  eligibleWallets: string[]
}

// Aggregates eligibility across many wallets: one entry per distinct list, with
// the set of wallets that qualify. Public lists list every wallet.
export async function fetchAggregatedEligibility(
  slug: string,
  contractAddress: string,
  wallets: string[]
): Promise<WalletEligibility[]> {
  const byListId = new Map<string, WalletEligibility>()
  // Sequential to stay gentle on the API (no key, WAF-backed) — wallet counts
  // here are small (selected mint wallets), so this is not a hot loop.
  for (const w of wallets) {
    let lists: ScatterList[]
    try {
      lists = await fetchEligibleLists(slug, contractAddress, w)
    } catch {
      continue // one wallet's lookup failing shouldn't drop the whole set
    }
    for (const list of lists) {
      const entry = byListId.get(list.id)
      if (entry) entry.eligibleWallets.push(w)
      else byListId.set(list.id, { list, eligibleWallets: [w] })
    }
  }
  return [...byListId.values()]
}

export interface ResolvedWalletMint {
  address: string
  /** Ready-to-encode mint() args: [ [key, proof], quantity, affiliate, signature ]. */
  args: unknown[]
  valueWei: bigint
}

export interface ResolveMintResult {
  resolved: ResolvedWalletMint[]
  skipped: Array<{ address: string; reason: string }>
}

// For a chosen list, fetches each wallet's mint calldata from Scatter, DECODES
// it, VALIDATES every field, and returns re-encodable per-wallet args. Any wallet
// whose calldata fails a check is skipped with a reason — never minted blindly.
export async function resolveListMint(
  chainId: number,
  contractAddress: string,
  list: ScatterList,
  quantity: number,
  wallets: string[]
): Promise<ResolveMintResult> {
  const resolved: ResolvedWalletMint[] = []
  const skipped: Array<{ address: string; reason: string }> = []
  const contract = getAddress(contractAddress)
  const expectedValue = parseEther(list.priceEth) * BigInt(quantity)

  if (!list.isEth) {
    return { resolved: [], skipped: wallets.map((a) => ({ address: a, reason: `Priced in ${list.currencySymbol}, not ETH — mint on scatter.art` })) }
  }

  for (const wallet of wallets) {
    try {
      const data = (await getJson(`${API_BASE}/mint`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          collectionAddress: contract,
          chainId,
          minterAddress: wallet,
          lists: [{ id: list.id, quantity }],
        }),
      })) as { mintTransaction?: { to: string; value: string; data: string }; erc20s?: unknown[] }

      const tx = data.mintTransaction
      if (!tx?.data || !tx.to) { skipped.push({ address: wallet, reason: "No mint transaction returned (wallet may be ineligible)" }); continue }

      // --- Validate before trusting anything -------------------------------
      // 1. Must be the Archetype public mint selector.
      if (tx.data.slice(0, 10).toLowerCase() !== SEL_ARCHETYPE_MINT) {
        skipped.push({ address: wallet, reason: "Unexpected mint selector — routed through an unsupported path (mint on scatter.art)" }); continue
      }
      // 2. Must target the collection itself — reject batch/other contracts we
      //    can't independently verify.
      if (getAddress(tx.to) !== contract) {
        skipped.push({ address: wallet, reason: "Scatter routed this through a different contract (batch mint) we don't verify — mint on scatter.art" }); continue
      }
      // 3. Decode + check args match what we asked and what the list says.
      const decoded = MINT_IFACE.decodeFunctionData("mint", tx.data)
      const auth = decoded[0] as { key: string; proof: string[] }
      const decodedQty = BigInt(decoded[1])
      const affiliate = decoded[2] as string
      if (decodedQty !== BigInt(quantity)) { skipped.push({ address: wallet, reason: "Returned quantity didn't match" }); continue }
      if (getAddress(affiliate) !== ZERO) { skipped.push({ address: wallet, reason: "Returned calldata set an affiliate — rejected" }); continue }
      if (auth.key.toLowerCase() !== list.root.toLowerCase()) { skipped.push({ address: wallet, reason: "Returned invite key didn't match the chosen list" }); continue }
      // 4. Value must equal price * quantity exactly.
      if (BigInt(tx.value) !== expectedValue) { skipped.push({ address: wallet, reason: "Returned price didn't match the list price" }); continue }

      // Re-encode from validated components (proof from Scatter, tx built by us).
      resolved.push({
        address: wallet,
        args: [[auth.key, [...auth.proof]], String(quantity), ZERO, "0x"],
        valueWei: expectedValue,
      })
    } catch (e) {
      skipped.push({ address: wallet, reason: e instanceof Error ? e.message : "Resolve failed" })
    }
  }

  return { resolved, skipped }
}
