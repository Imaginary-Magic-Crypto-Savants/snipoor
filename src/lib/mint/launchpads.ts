import { Interface, getAddress, formatEther, AbiCoder, solidityPackedKeccak256 } from "ethers"
import { getProvider, withRetry } from "~/lib/chain/provider"
import { getContractSelectors } from "~/lib/chain/proxy"
import type { ContractDetection } from "./detect"
import type { RankedMintFunction } from "./detector"

const ZERO = "0x0000000000000000000000000000000000000000"

// ---------------------------------------------------------------------------
// OpenSea SeaDrop
// ---------------------------------------------------------------------------
// SeaDrop tokens have NO public mint on the token contract — the only mint
// entry, mintSeaDrop(address,uint256), reverts for anyone except an allowed
// SeaDrop contract. Minting goes through SeaDrop.mintPublic(nftContract,
// feeRecipient, minterIfNotPayer, quantity). We fingerprint the token by its
// dispatched selectors, then read the live public-drop config off-chain.

const CANONICAL_SEADROP = "0x00005EA00Ac477B1030CE78506496e8C2dE24bf5"
const OS_FEE_RECIPIENT = "0x0000a26b00c1F0DF003000390027140000fAa719"

const SEL_MINT_SEADROP = "0x64869dad" // mintSeaDrop(address,uint256)
const SEL_GET_MINT_STATS = "0x840e15d4" // getMintStats(address)

const SEADROP_IFACE = new Interface([
  "function getPublicDrop(address nftContract) view returns ((uint80 mintPrice, uint48 startTime, uint48 endTime, uint16 maxTotalMintableByWallet, uint16 feeBps, bool restrictFeeRecipients))",
  "function getAllowedFeeRecipients(address nftContract) view returns (address[])",
])
const TOKEN_IFACE = new Interface([
  "function getAllowedSeaDrop() view returns (address[])",
  "function getMintStats(address minter) view returns (uint256 minterNumMinted, uint256 currentTotalSupply, uint256 maxSupply)",
])

const MINT_PUBLIC_ABI = [
  {
    type: "function",
    name: "mintPublic",
    stateMutability: "payable",
    inputs: [
      { name: "nftContract", type: "address" },
      { name: "feeRecipient", type: "address" },
      { name: "minterIfNotPayer", type: "address" },
      { name: "quantity", type: "uint256" },
    ],
    outputs: [],
  },
]

function fmtTime(unix: number): string {
  return new Date(unix * 1000).toLocaleString()
}

// Clamp a uint256 to a JS-safe integer for display. Open editions use
// type(uint256).max as "unlimited", which would become Infinity via Number().
function toSafeNumber(b: bigint): number {
  return b > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(b)
}

export async function detectSeaDrop(
  chainId: number,
  contract: string,
  caller: string,
  quantity: number
): Promise<ContractDetection | null> {
  // mintSeaDrop(address,uint256) is the strong, specific signal that a token is
  // SeaDrop-based. getMintStats is advisory (used for supply warnings) — some
  // forks omit it, so we don't hard-gate on it here. We confirm below via a
  // configured drop or a working getMintStats before committing to the route.
  const { selectors } = await getContractSelectors(chainId, contract)
  if (!selectors.has(SEL_MINT_SEADROP)) return null

  const provider = getProvider(chainId)
  const nft = getAddress(contract)

  // Which SeaDrop contracts has this token allowed? Falls back to the canonical.
  let seadrops: string[] = []
  try {
    const r = await withRetry(chainId, () =>
      provider.call({ to: nft, data: TOKEN_IFACE.encodeFunctionData("getAllowedSeaDrop", []) })
    )
    if (r && r !== "0x") {
      const [list] = TOKEN_IFACE.decodeFunctionResult("getAllowedSeaDrop", r) as unknown as [string[]]
      seadrops = list.map((a) => getAddress(a))
    }
  } catch {}
  if (seadrops.length === 0) seadrops = [CANONICAL_SEADROP]

  // Find a SeaDrop with a configured public drop for this token.
  type Drop = {
    mintPrice: bigint
    startTime: number
    endTime: number
    maxTotalMintableByWallet: number
    feeBps: number
    restrictFeeRecipients: boolean
  }
  let chosenSeaDrop = seadrops[0]
  let drop: Drop | null = null
  for (const sd of seadrops) {
    try {
      const r = await withRetry(chainId, () =>
        provider.call({ to: sd, data: SEADROP_IFACE.encodeFunctionData("getPublicDrop", [nft]) })
      )
      const [d] = SEADROP_IFACE.decodeFunctionResult("getPublicDrop", r)
      const parsed: Drop = {
        mintPrice: BigInt(d.mintPrice),
        startTime: Number(d.startTime),
        endTime: Number(d.endTime),
        maxTotalMintableByWallet: Number(d.maxTotalMintableByWallet),
        feeBps: Number(d.feeBps),
        restrictFeeRecipients: Boolean(d.restrictFeeRecipients),
      }
      // A drop is "configured" if any field is set. endTime == 0 is a valid
      // open-ended sale, so we must NOT require endTime > 0 (that would skip
      // live drops and fall through to a wrong route).
      const configured = parsed.mintPrice > 0n || parsed.startTime > 0 || parsed.endTime > 0
      if (configured) {
        chosenSeaDrop = sd
        drop = parsed
        break
      }
    } catch {}
  }

  // Allowed fee recipient (required when restrictFeeRecipients is set).
  let feeRecipient = OS_FEE_RECIPIENT
  try {
    const r = await withRetry(chainId, () =>
      provider.call({ to: chosenSeaDrop, data: SEADROP_IFACE.encodeFunctionData("getAllowedFeeRecipients", [nft]) })
    )
    const [list] = SEADROP_IFACE.decodeFunctionResult("getAllowedFeeRecipients", r) as unknown as [string[]]
    if (list.length > 0) feeRecipient = getAddress(list[0])
  } catch {}

  // Supply / per-wallet stats.
  let mintedByWallet = 0n
  let totalSupply = 0n
  let maxSupply = 0n
  let statsOk = false
  try {
    const r = await withRetry(chainId, () =>
      provider.call({ to: nft, data: TOKEN_IFACE.encodeFunctionData("getMintStats", [caller]) })
    )
    const s = TOKEN_IFACE.decodeFunctionResult("getMintStats", r)
    mintedByWallet = BigInt(s.minterNumMinted)
    totalSupply = BigInt(s.currentTotalSupply)
    maxSupply = BigInt(s.maxSupply)
    statsOk = true
  } catch {}

  // Confirm this really is a SeaDrop token before committing to the route: we
  // need a configured public drop, working getMintStats, or at least the
  // getMintStats selector. Otherwise a coincidental mintSeaDrop selector hit
  // falls through to the next detection tier instead of a wrong route.
  if (!drop && !statsOk && !selectors.has(SEL_GET_MINT_STATS)) return null

  const now = Math.floor(Date.now() / 1000)
  const warnings: string[] = []
  const priceWei = drop?.mintPrice ?? 0n
  const priceEth = formatEther(priceWei)
  const maxPerWallet = drop?.maxTotalMintableByWallet ?? 0
  const startsAt = drop?.startTime ?? 0
  const endsAt = drop?.endTime ?? 0
  const soldOut = maxSupply > 0n && totalSupply >= maxSupply
  // endTime == 0 means open-ended (no upper bound).
  const hasEnd = endsAt > 0
  const active = drop ? now >= startsAt && (!hasEnd || now <= endsAt) : false

  if (!drop) {
    warnings.push("No public SeaDrop sale configured — this drop may be allowlist-only or not yet set up.")
  } else {
    if (now < startsAt) warnings.push(`Public sale not live yet — starts ${fmtTime(startsAt)}.`)
    if (hasEnd && now > endsAt) warnings.push(`Public sale ended ${fmtTime(endsAt)}.`)
    if (maxPerWallet > 0 && quantity > maxPerWallet)
      warnings.push(`Max ${maxPerWallet} per wallet for this drop — lower quantity from ${quantity}.`)
  }
  if (soldOut) warnings.push(`Sold out — ${totalSupply}/${maxSupply} minted.`)
  if (maxPerWallet > 0 && mintedByWallet >= BigInt(maxPerWallet))
    warnings.push("This wallet already hit its per-wallet mint limit.")
  if (drop?.restrictFeeRecipients && feeRecipient.toLowerCase() === ZERO)
    warnings.push("Drop requires a specific fee recipient but none could be resolved.")

  const valueWei = priceWei * BigInt(quantity)

  const fn: RankedMintFunction = {
    name: "mintPublic",
    signature: "mintPublic(address,address,address,uint256)",
    inputs: [
      { name: "nftContract", type: "address" },
      { name: "feeRecipient", type: "address" },
      { name: "minterIfNotPayer", type: "address" },
      { name: "quantity", type: "uint256" },
    ],
    payable: true,
    stateMutability: "payable",
    score: 1000,
    classifiedInputs: [
      { name: "nftContract", type: "address", role: "unknown", defaultValue: nft },
      { name: "feeRecipient", type: "address", role: "unknown", defaultValue: feeRecipient },
      { name: "minterIfNotPayer", type: "address", role: "unknown", defaultValue: ZERO },
      { name: "quantity", type: "uint256", role: "quantity", defaultValue: String(quantity) },
    ],
  }

  return {
    functions: [fn],
    bestIndex: 0,
    mintPrice: priceWei > 0n ? priceEth : null,
    callTarget: getAddress(chosenSeaDrop),
    abiJson: JSON.stringify(MINT_PUBLIC_ABI),
    prefillArgs: {
      nftContract: nft,
      feeRecipient,
      minterIfNotPayer: ZERO,
      quantity: String(quantity),
    },
    value: formatEther(valueWei),
    platform: "OpenSea SeaDrop",
    method: "launchpad",
    dropState: {
      active,
      soldOut,
      maxPerWallet,
      mintedByWallet: toSafeNumber(mintedByWallet),
      totalSupply: toSafeNumber(totalSupply),
      maxSupply: toSafeNumber(maxSupply),
      startsAt,
      endsAt,
      priceEth,
    },
    warnings,
  }
}

// ---------------------------------------------------------------------------
// Scatter.art (Archetype by ScatterDAO)
// ---------------------------------------------------------------------------
// Archetype tokens mint directly on the token contract via
// mint((bytes32 key, bytes32[] proof) auth, uint256 quantity, address affiliate,
// bytes signature). The selector 0x4a21a2df is byte-identical across every
// deployed version (v0.4.0 - v0.8.0) because the Auth tuple never changed.
// Public lists: any key <= 0xff verifies unconditionally (v0.5.1+; v0.4 only
// special-cases key 0), proof empty, affiliate zero, signature empty ("0x" —
// the affiliate signature is only checked when affiliate != 0).
//
// Sale config lives in the public invites(bytes32) mapping. The getter selector
// is version-invariant but the RETURN LAYOUT is not — decode by raw length:
//   128 bytes -> v0.4   Invite{price,start,limit,tokenAddress}
//   320 bytes -> v0.5/6 DutchInvite{price,reservePrice,delta,start,end,limit,
//                        maxSupply,interval,unitSize,tokenAddress}
//   352 bytes -> v0.7/8 + isBlacklist bool appended (renamed AdvancedInvite)
// All fields are static types, so the encoding is a flat word-per-field tuple
// and length alone is decisive.

const SEL_ARCHETYPE_MINT = "0x4a21a2df" // mint((bytes32,bytes32[]),uint256,address,bytes)
const SEL_ARCHETYPE_INVITES = "0xa5aa4aa4" // invites(bytes32)

const BYTES32_ZERO = "0x" + "00".repeat(32)
const UINT32_MAX = 0xffffffff

const ARCHETYPE_IFACE = new Interface([
  "function invites(bytes32 key) view returns (bytes)", // encode-only; decoded manually by length
  // Auto-generated public struct getter: Solidity flattens the members, so the
  // return is NOT a single tuple (live-verified against toxik kidz on mainnet).
  "function config() view returns (string baseUri, address affiliateSigner, uint32 maxSupply, uint32 maxBatchSize, uint16 affiliateFee, uint16 affiliateDiscount, uint16 defaultRoyalty)",
  "function minted(address minter, bytes32 key) view returns (uint256)",
  "function listSupply(bytes32 key) view returns (uint256)",
  "function computePrice(bytes32 key, uint256 quantity, bool affiliateUsed) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
])

const ARCHETYPE_MINT_ABI = [
  {
    type: "function",
    name: "mint",
    stateMutability: "payable",
    inputs: [
      {
        name: "auth",
        type: "tuple",
        components: [
          { name: "key", type: "bytes32" },
          { name: "proof", type: "bytes32[]" },
        ],
      },
      { name: "quantity", type: "uint256" },
      { name: "affiliate", type: "address" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
]

interface ArchetypeInvite {
  price: bigint
  reservePrice: bigint
  delta: bigint
  start: number
  end: number
  limit: number
  maxSupply: number
  interval: number
  unitSize: number
  tokenAddress: string
  isBlacklist: boolean
}

// Decodes the raw invites(key) return by length. Exported for tests.
export function decodeArchetypeInvite(raw: string): ArchetypeInvite | null {
  const byteLen = (raw.length - 2) / 2
  const abi = AbiCoder.defaultAbiCoder()
  try {
    if (byteLen === 352) {
      const d = abi.decode(
        ["uint128", "uint128", "uint128", "uint32", "uint32", "uint32", "uint32", "uint32", "uint32", "address", "bool"],
        raw
      )
      return {
        price: BigInt(d[0]), reservePrice: BigInt(d[1]), delta: BigInt(d[2]),
        start: Number(d[3]), end: Number(d[4]), limit: Number(d[5]),
        maxSupply: Number(d[6]), interval: Number(d[7]), unitSize: Number(d[8]),
        tokenAddress: getAddress(d[9]), isBlacklist: Boolean(d[10]),
      }
    }
    if (byteLen === 320) {
      const d = abi.decode(
        ["uint128", "uint128", "uint128", "uint32", "uint32", "uint32", "uint32", "uint32", "uint32", "address"],
        raw
      )
      return {
        price: BigInt(d[0]), reservePrice: BigInt(d[1]), delta: BigInt(d[2]),
        start: Number(d[3]), end: Number(d[4]), limit: Number(d[5]),
        maxSupply: Number(d[6]), interval: Number(d[7]), unitSize: Number(d[8]),
        tokenAddress: getAddress(d[9]), isBlacklist: false,
      }
    }
    if (byteLen === 128) {
      // v0.4: Invite{uint128 price, uint32 start, uint32 limit, address tokenAddress}
      const d = abi.decode(["uint128", "uint32", "uint32", "address"], raw)
      return {
        price: BigInt(d[0]), reservePrice: 0n, delta: 0n,
        start: Number(d[1]), end: 0, limit: Number(d[2]),
        maxSupply: 0, interval: 0, unitSize: 1,
        tokenAddress: getAddress(d[3]), isBlacklist: false,
      }
    }
  } catch {}
  return null
}

export async function detectArchetype(
  chainId: number,
  contract: string,
  caller: string,
  quantity: number
): Promise<ContractDetection | null> {
  // Fingerprint: the version-stable Archetype mint selector plus the invites
  // getter. Both must dispatch (proxy/clone-resolved) before we commit.
  const { selectors } = await getContractSelectors(chainId, contract)
  if (!selectors.has(SEL_ARCHETYPE_MINT) || !selectors.has(SEL_ARCHETYPE_INVITES)) return null

  const provider = getProvider(chainId)
  const nft = getAddress(contract)

  const callInvites = async (key: string): Promise<ArchetypeInvite | null> => {
    try {
      const raw = await withRetry(chainId, () =>
        provider.call({ to: nft, data: SEL_ARCHETYPE_INVITES + key.slice(2) })
      )
      if (!raw || raw === "0x") return null
      return decodeArchetypeInvite(raw)
    } catch {
      return null
    }
  }

  // Public key candidates: bytes32(0) (Scatter's frontend default for the
  // "Public!" list) and keccak256(tokenAddress), both unconditionally public
  // per Archetype's verify(). Creators can rotate the live list to another
  // key — if neither is configured we still surface the route with a warning
  // instead of falling through to a wrong tier.
  const keyCandidates = [BYTES32_ZERO, solidityPackedKeccak256(["address"], [nft])]
  let inviteKey = BYTES32_ZERO
  let invite: ArchetypeInvite | null = null
  for (const key of keyCandidates) {
    const inv = await callInvites(key)
    // limit == 0 means the list was never configured (or was closed out).
    if (inv && inv.limit > 0) {
      inviteKey = key
      invite = inv
      break
    }
  }
  // A decodable-but-unconfigured invites(0) read still proves the interface;
  // an undecodable one (wrong return shape) means this is not Archetype.
  if (!invite) {
    const probe = await callInvites(BYTES32_ZERO)
    if (!probe) return null
  }

  const readUint = async (data: string): Promise<bigint | null> => {
    try {
      const r = await withRetry(chainId, () => provider.call({ to: nft, data }))
      if (!r || r === "0x") return null
      return BigInt(AbiCoder.defaultAbiCoder().decode(["uint256"], r)[0])
    } catch {
      return null
    }
  }

  // Supply / per-wallet / price reads (all advisory — every one degrades to
  // "unknown" rather than blocking the route).
  const [totalSupply, mintedByWallet, listMinted, unitPriceNow, totalPriceNow] = await Promise.all([
    readUint(ARCHETYPE_IFACE.encodeFunctionData("totalSupply", [])),
    readUint(ARCHETYPE_IFACE.encodeFunctionData("minted", [caller, inviteKey])),
    readUint(ARCHETYPE_IFACE.encodeFunctionData("listSupply", [inviteKey])),
    invite ? readUint(ARCHETYPE_IFACE.encodeFunctionData("computePrice", [inviteKey, 1n, false])) : Promise.resolve(null),
    invite ? readUint(ARCHETYPE_IFACE.encodeFunctionData("computePrice", [inviteKey, BigInt(quantity), false])) : Promise.resolve(null),
  ])

  // Collection max supply comes from config() — v0.8 layout only. Pre-0.8
  // configs have a different, larger struct; the decode simply fails and we
  // fall back to the per-list maxSupply.
  let collectionMax = 0
  try {
    const r = await withRetry(chainId, () =>
      provider.call({ to: nft, data: ARCHETYPE_IFACE.encodeFunctionData("config", []) })
    )
    const cfg = ARCHETYPE_IFACE.decodeFunctionResult("config", r)
    collectionMax = Number(cfg.maxSupply)
  } catch {}

  const now = Math.floor(Date.now() / 1000)
  const warnings: string[] = []

  const priceWei = unitPriceNow ?? invite?.price ?? 0n
  const valueWei = totalPriceNow ?? priceWei * BigInt(quantity)
  const startsAt = invite?.start ?? 0
  const rawEnd = invite?.end ?? 0
  const endsAt = rawEnd >= UINT32_MAX ? 0 : rawEnd // uint32 max = open-ended
  const listMax = invite && invite.maxSupply > 0 && invite.maxSupply < UINT32_MAX ? invite.maxSupply : 0
  const maxSupply = collectionMax > 0 ? collectionMax : listMax
  const maxPerWallet = invite && invite.limit > 0 && invite.limit < UINT32_MAX ? invite.limit : 0
  const supply = totalSupply ?? 0n
  const soldOutCollection = collectionMax > 0 && supply >= BigInt(collectionMax)
  const soldOutList = listMax > 0 && (listMinted ?? 0n) >= BigInt(listMax)
  const soldOut = soldOutCollection || soldOutList
  const active = invite ? now >= startsAt && (endsAt === 0 || now <= endsAt) : false

  if (!invite) {
    warnings.push(
      "Archetype contract detected but no public list at the default keys — the creator may use a rotated invite key or allowlist-only phases. Check scatter.art for this drop."
    )
  } else {
    if (now < startsAt) warnings.push(`Public sale not live yet — starts ${fmtTime(startsAt)}.`)
    if (endsAt > 0 && now > endsAt) warnings.push(`Public sale ended ${fmtTime(endsAt)}.`)
    if (invite.tokenAddress.toLowerCase() !== ZERO) {
      warnings.push("This list is priced in an ERC20 token, not ETH — auto-mint can't pay it. Mint on scatter.art instead.")
    }
    if (invite.delta > 0n) {
      warnings.push("Dutch-auction pricing — the price moves over time, so the exact cost is re-read at detection. Re-detect right before minting.")
    }
    if (invite.unitSize > 1) {
      warnings.push(`Each mint unit delivers ${invite.unitSize} tokens.`)
    }
    if (maxPerWallet > 0 && quantity > maxPerWallet) {
      warnings.push(`Max ${maxPerWallet} per wallet on this list — lower quantity from ${quantity}.`)
    }
    if (maxPerWallet > 0 && (mintedByWallet ?? 0n) >= BigInt(maxPerWallet)) {
      warnings.push("This wallet already hit its per-wallet mint limit.")
    }
  }
  if (soldOut) warnings.push(soldOutList && !soldOutCollection ? "This list's allocation is minted out." : `Sold out — ${supply}/${maxSupply} minted.`)

  const priceEth = formatEther(priceWei)
  const authJson = JSON.stringify([inviteKey, []])

  const fn: RankedMintFunction = {
    name: "mint",
    signature: "mint((bytes32,bytes32[]),uint256,address,bytes)",
    inputs: [
      { name: "auth", type: "tuple" },
      { name: "quantity", type: "uint256" },
      { name: "affiliate", type: "address" },
      { name: "signature", type: "bytes" },
    ],
    payable: true,
    stateMutability: "payable",
    score: 1000,
    classifiedInputs: [
      { name: "auth", type: "tuple", role: "unknown", defaultValue: authJson },
      { name: "quantity", type: "uint256", role: "quantity", defaultValue: String(quantity) },
      { name: "affiliate", type: "address", role: "referral", defaultValue: ZERO },
      { name: "signature", type: "bytes", role: "unknown", defaultValue: "0x" },
    ],
  }

  return {
    functions: [fn],
    bestIndex: 0,
    mintPrice: priceWei > 0n ? priceEth : null,
    callTarget: nft,
    abiJson: JSON.stringify(ARCHETYPE_MINT_ABI),
    prefillArgs: {
      auth: authJson,
      quantity: String(quantity),
      affiliate: ZERO,
      signature: "0x",
    },
    value: formatEther(valueWei),
    platform: "Scatter (Archetype)",
    method: "launchpad",
    dropState: {
      active,
      soldOut,
      maxPerWallet,
      mintedByWallet: toSafeNumber(mintedByWallet ?? 0n),
      totalSupply: toSafeNumber(supply),
      maxSupply,
      startsAt,
      endsAt,
      priceEth,
    },
    warnings,
  }
}

// Registry of tier-1 launchpad detectors, tried in order. Each returns a full
// ContractDetection on a confident match, or null to fall through to the next
// tier. thirdweb / Zora / Manifold detectors slot in here later.
export const LAUNCHPAD_DETECTORS: Array<
  (chainId: number, contract: string, caller: string, quantity: number) => Promise<ContractDetection | null>
> = [detectSeaDrop, detectArchetype]
