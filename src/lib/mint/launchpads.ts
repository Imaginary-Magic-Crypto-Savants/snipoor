import { Interface, getAddress, formatEther } from "ethers"
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

// Registry of tier-1 launchpad detectors, tried in order. Each returns a full
// ContractDetection on a confident match, or null to fall through to the next
// tier. thirdweb / Zora / Manifold detectors slot in here later.
export const LAUNCHPAD_DETECTORS: Array<
  (chainId: number, contract: string, caller: string, quantity: number) => Promise<ContractDetection | null>
> = [detectSeaDrop]
