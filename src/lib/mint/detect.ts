import { parseEther, formatEther } from "ethers"
import { fetchContractABI } from "~/lib/nft/etherscan"
import { resolveImplementation } from "~/lib/chain/proxy"
import { detectMintFunctions, detectMintPrice, probeMintSelectors, type RankedMintFunction } from "./detector"
import { LAUNCHPAD_DETECTORS } from "./launchpads"

export interface DropState {
  active: boolean
  soldOut: boolean
  maxPerWallet: number
  mintedByWallet: number
  totalSupply: number
  maxSupply: number
  startsAt: number
  endsAt: number
  priceEth: string
}

export type DetectionMethod = "launchpad" | "verified-abi" | "bytecode" | "probe" | "none"

export interface ContractDetection {
  functions: RankedMintFunction[]
  bestIndex: number
  mintPrice: string | null
  /** Where the mint tx is actually sent — the launchpad router for SeaDrop etc, else the contract itself. */
  callTarget: string
  abiJson: string
  /** Concrete, ready-to-use arg values keyed by input name (no placeholders to resolve, except {{CALLER}} for recipients). */
  prefillArgs: Record<string, string>
  /** Required msg.value in ETH for the chosen quantity. */
  value: string
  /** Human label of the detected platform, or null when generic. */
  platform: string | null
  method: DetectionMethod
  dropState?: DropState
  warnings: string[]
}

function safeScale(unitEth: string, qty: number): string {
  try {
    return formatEther(parseEther(unitEth) * BigInt(qty > 0 ? qty : 1))
  } catch {
    return unitEth
  }
}

function buildPrefillArgs(fn: RankedMintFunction | undefined, quantity: number): Record<string, string> {
  const out: Record<string, string> = {}
  if (!fn?.classifiedInputs) return out
  for (const ci of fn.classifiedInputs) {
    out[ci.name] = ci.role === "quantity" ? String(quantity) : ci.defaultValue
  }
  return out
}

function fromFunctions(
  functions: RankedMintFunction[],
  abiJson: string,
  contract: string,
  mintPrice: string | null,
  method: DetectionMethod,
  quantity: number
): ContractDetection {
  const best = functions[0]
  return {
    functions,
    bestIndex: functions.length > 0 ? 0 : -1,
    mintPrice,
    callTarget: contract,
    abiJson,
    prefillArgs: buildPrefillArgs(best, quantity),
    // Generic mints: value = unit price * quantity when payable and price known.
    // Integer wei math avoids float / scientific-notation drift on tiny prices.
    value: best?.payable && mintPrice ? safeScale(mintPrice, quantity) : "0",
    platform: null,
    method,
    warnings: [],
  }
}

/**
 * Best-in-class mint detection. Runs a cascade and stops at the first confident
 * route:
 *   1. Launchpad fingerprint (on-chain interface match → correct router + live
 *      drop config). Bulletproof for known platforms.
 *   2. Verified ABI (Etherscan), proxy-aware — falls back to the implementation
 *      ABI when the address is a proxy.
 *   3. Bytecode / proxy resolution — resolve a proxy to its impl and re-run the
 *      launchpad fingerprint against the real logic contract.
 *   4. Selector probe — last resort, tests common mint signatures on-chain.
 */
export async function detectContract(
  chainId: number,
  contract: string,
  caller: string,
  quantity: number
): Promise<ContractDetection> {
  const qty = quantity > 0 ? quantity : 1

  // Tier 1 — launchpad fingerprint (resolves proxies internally).
  for (const detect of LAUNCHPAD_DETECTORS) {
    const hit = await detect(chainId, contract, caller, qty).catch(() => null)
    if (hit) return hit
  }

  // Tier 2 — verified ABI (proxy-aware).
  try {
    let abiJson = await fetchContractABI(chainId, contract)
    let functions = detectMintFunctions(abiJson)
    if (functions.length === 0) {
      const impl = await resolveImplementation(chainId, contract).catch(() => null)
      if (impl) {
        const implAbi = await fetchContractABI(chainId, impl).catch(() => null)
        if (implAbi) {
          const implFns = detectMintFunctions(implAbi)
          if (implFns.length > 0) {
            abiJson = implAbi
            functions = implFns
          }
        }
      }
    }
    if (functions.length > 0) {
      const price = await detectMintPrice(chainId, contract, abiJson).catch(() => null)
      return fromFunctions(functions, abiJson, contract, price, "verified-abi", qty)
    }
  } catch {}

  // Tier 4 — selector probe (Tier 3 bytecode-match is the proxy resolution
  // already folded into Tiers 1 & 2; standard-bytecode matching lands here later).
  try {
    const probed = await probeMintSelectors(chainId, contract, caller)
    if (probed.length > 0) {
      const price = await detectMintPrice(chainId, contract).catch(() => null)
      const abiJson = JSON.stringify(
        probed.map((f) => ({
          type: "function",
          name: f.name,
          stateMutability: "payable",
          inputs: f.inputs,
          outputs: [],
        }))
      )
      return fromFunctions(probed, abiJson, contract, price, "probe", qty)
    }
  } catch {}

  return {
    functions: [],
    bestIndex: -1,
    mintPrice: null,
    callTarget: contract,
    abiJson: "",
    prefillArgs: {},
    value: "0",
    platform: null,
    method: "none",
    warnings: ["Could not auto-detect a mint function. Paste the ABI manually or pick a platform preset."],
  }
}
