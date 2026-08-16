import { Interface, AbiCoder, formatEther, parseEther } from "ethers"
import { getProvider, withRetry } from "~/lib/chain/provider"
import type { MintFunction, ArgRole, ClassifiedInput } from "./types"

const MINT_PATTERNS = [
  "mint", "claim", "purchase", "buy", "redeem",
  "presale", "whitelist", "allowlist", "public",
  "airdrop", "drop", "collect", "reserve",
  "create", "forge", "breed", "summon", "roll",
  "adopt", "hatch", "reveal", "open",
]

const EXCLUDED_NAMES = new Set([
  "approve", "setApprovalForAll", "transferFrom", "safeTransferFrom",
  "transfer", "burn", "renounceOwnership", "transferOwnership",
  "withdraw", "withdrawAll", "withdrawETH", "setBaseURI", "revealTokens",
  "openSale", "openPresale", "openPublicSale", "createOrder",
  "setMerkleRoot", "setPrice", "setMaxSupply", "pause", "unpause",
  "toggleSale", "togglePresale", "setPublicSale", "setPresale",
  "flipSaleState", "flipPresaleState", "setContractURI",
  "setProvenanceHash", "setRoyaltyInfo", "setDefaultRoyalty",
  // Callback-only: revert for a normal EOA — these are invoked by a launchpad
  // router (SeaDrop), never called directly. Auto-selecting them guarantees a
  // revert; routing is handled by the launchpad tier in detect.ts instead.
  "mintSeaDrop",
  // Admin / privileged mints: revert unless caller is owner/minter role.
  "ownerMint", "devMint", "teamMint", "reserveMint", "adminMint",
  "reservedMint", "ownerClaim", "promoMint", "giftMint", "airdropMint",
])

export interface RankedMintFunction extends MintFunction {
  score: number
  classifiedInputs: ClassifiedInput[]
}

const QUANTITY_NAMES = /^(amount|quantity|qty|count|num|number|tokens|numTokens|numberOfTokens|mintAmount|_quantity|_amount|_count|_numberOfTokens|_mintAmount|_numTokens)$/i
const RECIPIENT_NAMES = /^(to|recipient|receiver|minter|_to|_recipient|_receiver|account|_account|owner|_owner|minterIfNotPayer)$/i
const PROOF_NAMES = /^(proof|merkleProof|_proof|_merkleProof|allowlistProof|whitelistProof)$/i
const REFERRAL_NAMES = /^(referral|mintReferral|_referral|ref|_ref|affiliate)$/i
const COMMENT_NAMES = /^(comment|message|_comment|_message|memo|_memo|note)$/i
const TOKEN_ID_NAMES = /^(tokenId|_tokenId|id|_id|token)$/i

const PRICE_FUNCTIONS = [
  "price", "mintPrice", "cost", "PRICE", "MINT_PRICE",
  "getPrice", "getMintPrice", "publicPrice", "salePrice",
  "tokenPrice", "pricePerToken", "pricePerMint",
]

function classifyInput(input: { name: string; type: string }): ClassifiedInput {
  const { name, type } = input

  if (type.startsWith("uint") && QUANTITY_NAMES.test(name)) {
    return { name, type, role: "quantity", defaultValue: "1" }
  }
  if (type === "address" && RECIPIENT_NAMES.test(name)) {
    return { name, type, role: "recipient", defaultValue: "{{CALLER}}" }
  }
  if ((type === "bytes32[]" || type === "bytes[]") && PROOF_NAMES.test(name)) {
    return { name, type, role: "proof", defaultValue: "[]" }
  }
  if (type === "address" && REFERRAL_NAMES.test(name)) {
    return { name, type, role: "referral", defaultValue: "0x0000000000000000000000000000000000000000" }
  }
  if (type === "string" && COMMENT_NAMES.test(name)) {
    return { name, type, role: "comment", defaultValue: "" }
  }
  if (type.startsWith("uint") && TOKEN_ID_NAMES.test(name)) {
    return { name, type, role: "tokenId", defaultValue: "" }
  }

  if (type === "address") {
    return { name, type, role: "recipient", defaultValue: "{{CALLER}}" }
  }
  if (type.startsWith("uint") && !QUANTITY_NAMES.test(name)) {
    const nameLower = name.toLowerCase()
    if (nameLower.includes("amount") || nameLower.includes("qty") || nameLower.includes("quantity") || nameLower.includes("count")) {
      return { name, type, role: "quantity", defaultValue: "1" }
    }
  }

  return { name, type, role: "unknown", defaultValue: "" }
}

function scoreMintFunction(fn: MintFunction, classified: ClassifiedInput[]): number {
  let score = 0
  const nameLower = fn.name.toLowerCase()

  if (MINT_PATTERNS.some((p) => nameLower.includes(p))) score += 50
  if (fn.payable) score += 30
  if (classified.some((c) => c.role === "quantity")) score += 20

  if (nameLower === "mint") score += 25
  else if (nameLower === "publicmint" || nameLower === "publicsalemint") score += 22
  else if (nameLower.startsWith("mint")) score += 15

  const unknowns = classified.filter((c) => c.role === "unknown").length
  score -= unknowns * 10

  const hasProof = classified.some((c) => c.role === "proof")
  if (hasProof) score -= 5

  if (fn.inputs.length <= 2) score += 10
  else if (fn.inputs.length <= 4) score += 5

  if (fn.inputs.length === 0 && fn.payable) score += 15
  if (fn.inputs.length === 1 && classified[0]?.role === "quantity") score += 20

  return score
}

export function detectMintFunctions(abiJson: string): RankedMintFunction[] {
  let abi: unknown[]
  try {
    abi = JSON.parse(abiJson)
  } catch {
    return []
  }

  const candidates: RankedMintFunction[] = []

  for (const item of abi) {
    if (typeof item !== "object" || item === null) continue
    const entry = item as Record<string, unknown>
    if (entry.type !== "function") continue

    const name = entry.name as string
    if (!name) continue
    const stateMutability = (entry.stateMutability as string) ?? ""
    const inputs = (entry.inputs as Array<{ name: string; type: string }>) ?? []

    if (stateMutability === "view" || stateMutability === "pure") continue
    if (EXCLUDED_NAMES.has(name)) continue

    const isPayable = stateMutability === "payable"
    const nameLower = name.toLowerCase()
    const isMintLike = MINT_PATTERNS.some((p) => nameLower.includes(p))

    const classifiedInputs = inputs.map(classifyInput)
    const hasQuantityParam = classifiedInputs.some((c) => c.role === "quantity")

    if (!isMintLike && !isPayable) continue
    if (!isMintLike && !hasQuantityParam) continue

    const inputTypes = inputs.map((i) => i.type).join(",")
    const fn: MintFunction = {
      name,
      signature: `${name}(${inputTypes})`,
      inputs,
      payable: isPayable,
      stateMutability,
    }

    const score = scoreMintFunction(fn, classifiedInputs)
    candidates.push({ ...fn, score, classifiedInputs })
  }

  candidates.sort((a, b) => b.score - a.score)
  return candidates
}

export async function detectMintPrice(chainId: number, contractAddress: string, abiJson?: string): Promise<string | null> {
  const coder = AbiCoder.defaultAbiCoder()

  if (abiJson) {
    try {
      const abi = JSON.parse(abiJson) as Array<Record<string, unknown>>
      const priceFns = abi.filter(
        (item) =>
          item.type === "function" &&
          (item.stateMutability === "view" || item.stateMutability === "pure") &&
          typeof item.name === "string" &&
          PRICE_FUNCTIONS.some((p) => (item.name as string).toLowerCase() === p.toLowerCase()) &&
          Array.isArray(item.inputs) &&
          (item.inputs as unknown[]).length === 0 &&
          Array.isArray(item.outputs) &&
          (item.outputs as Array<{ type: string }>).length > 0 &&
          (item.outputs as Array<{ type: string }>)[0].type.startsWith("uint")
      )

      if (priceFns.length > 0) {
        const iface = new Interface(abi)
        const fnName = priceFns[0].name as string
        const calldata = iface.encodeFunctionData(fnName)
        const result = await withRetry(chainId, () =>
          getProvider(chainId).call({ to: contractAddress, data: calldata })
        )
        const [raw] = coder.decode(["uint256"], result)
        const wei = BigInt(raw)
        if (wei > 0n) {
          // formatEther keeps full precision and never emits scientific
          // notation, which parseEther downstream would reject.
          return formatEther(wei)
        }
      }
    } catch {}
  }

  const priceSelectors = [
    "0x8d859f3e", // price()
    "0x26092b83", // mintPrice()
    "0x13faede6", // cost()
    "0x68075c11", // publicPrice()
    "0x3474a4a6", // salePrice()
  ]

  for (const selector of priceSelectors) {
    try {
      const result = await withRetry(chainId, () =>
        getProvider(chainId).call({ to: contractAddress, data: selector })
      )
      if (result && result !== "0x") {
        const [raw] = coder.decode(["uint256"], result)
        const wei = BigInt(raw)
        if (wei > 0n && wei < 100000000000000000000n) {
          return formatEther(wei)
        }
      }
    } catch {}
  }

  return null
}

const PROBE_SIGNATURES: Array<{
  sig: string
  name: string
  inputs: Array<{ name: string; type: string }>
}> = [
  { sig: "mint(uint256)", name: "mint", inputs: [{ name: "quantity", type: "uint256" }] },
  { sig: "mint()", name: "mint", inputs: [] },
  { sig: "publicMint(uint256)", name: "publicMint", inputs: [{ name: "quantity", type: "uint256" }] },
  { sig: "mint(address,uint256)", name: "mint", inputs: [{ name: "to", type: "address" }, { name: "quantity", type: "uint256" }] },
  { sig: "claim(uint256)", name: "claim", inputs: [{ name: "quantity", type: "uint256" }] },
  { sig: "claim()", name: "claim", inputs: [] },
  { sig: "purchase(uint256)", name: "purchase", inputs: [{ name: "quantity", type: "uint256" }] },
  { sig: "mint(uint256,bytes32[])", name: "mint", inputs: [{ name: "quantity", type: "uint256" }, { name: "proof", type: "bytes32[]" }] },
  { sig: "mint(address)", name: "mint", inputs: [{ name: "to", type: "address" }] },
  { sig: "publicSaleMint(uint256)", name: "publicSaleMint", inputs: [{ name: "quantity", type: "uint256" }] },
]

export async function probeMintSelectors(
  chainId: number,
  contractAddress: string,
  callerAddress: string
): Promise<RankedMintFunction[]> {
  const provider = getProvider(chainId)

  let probeValue = 0n
  try {
    const price = await detectMintPrice(chainId, contractAddress)
    if (price) {
      probeValue = parseEther(price) // full-precision; price is a clean decimal string
    }
  } catch {}
  if (probeValue === 0n) probeValue = 10000000000000000n // 0.01 ETH fallback

  const probeResults = await Promise.allSettled(
    PROBE_SIGNATURES.map(async (entry) => {
      const iface = new Interface([{
        type: "function",
        name: entry.name,
        stateMutability: "payable",
        inputs: entry.inputs,
        outputs: [],
      }])

      const testArgs = entry.inputs.map((inp) => {
        if (inp.type === "address") return callerAddress
        if (inp.type === "uint256") return "1"
        if (inp.type === "bytes32[]") return []
        return "0"
      })

      const calldata = iface.encodeFunctionData(entry.name, testArgs)

      await provider.estimateGas({
        to: contractAddress,
        data: calldata,
        value: probeValue,
        from: callerAddress,
      })

      return entry
    })
  )

  const found: RankedMintFunction[] = []

  for (const result of probeResults) {
    if (result.status !== "fulfilled") continue
    const entry = result.value
    const classifiedInputs = entry.inputs.map(classifyInput)
    const inputTypes = entry.inputs.map((inp) => inp.type).join(",")
    const fn: MintFunction = {
      name: entry.name,
      signature: `${entry.name}(${inputTypes})`,
      inputs: entry.inputs,
      payable: true,
      stateMutability: "payable",
    }
    const score = scoreMintFunction(fn, classifiedInputs)
    found.push({ ...fn, score, classifiedInputs })
  }

  found.sort((a, b) => b.score - a.score)

  const seen = new Set<string>()
  return found.filter((f) => {
    if (seen.has(f.signature)) return false
    seen.add(f.signature)
    return true
  })
}

