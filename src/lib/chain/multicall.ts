import { Contract, Interface, AbiCoder } from "ethers"
import { getProvider } from "./provider"
import { ERC20_ABI } from "~/lib/constants"

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11"

const MULTICALL3_ABI = [
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[])",
  "function getEthBalance(address addr) view returns (uint256 balance)",
]

export interface Call3 {
  target: string
  allowFailure: boolean
  callData: string
}

export interface MulticallResult {
  success: boolean
  returnData: string
}

const MAX_BATCH = 80

export async function multicall(
  chainId: number,
  calls: Call3[],
  providerOverride?: import("ethers").JsonRpcProvider,
): Promise<MulticallResult[]> {
  const provider = providerOverride ?? getProvider(chainId)
  const mc = new Contract(MULTICALL3, MULTICALL3_ABI, provider)
  const results: MulticallResult[] = []

  for (let i = 0; i < calls.length; i += MAX_BATCH) {
    if (i > 0) await new Promise((r) => setTimeout(r, 300))
    const batch = calls.slice(i, i + MAX_BATCH)
    const raw: Array<[boolean, string]> = await mc.aggregate3(batch)
    for (const [success, returnData] of raw) {
      results.push({ success, returnData })
    }
  }

  return results
}

const coder = AbiCoder.defaultAbiCoder()
const mcIface = new Interface(MULTICALL3_ABI)

export function encodeGetEthBalance(address: string): Call3 {
  return {
    target: MULTICALL3,
    allowFailure: true,
    callData: mcIface.encodeFunctionData("getEthBalance", [address]),
  }
}

export function decodeUint256(data: string): bigint {
  const [val] = coder.decode(["uint256"], data)
  return val
}

const erc20Iface = new Interface(ERC20_ABI)

export function encodeERC20BalanceOf(tokenAddress: string, walletAddress: string): Call3 {
  return {
    target: tokenAddress,
    allowFailure: true,
    callData: erc20Iface.encodeFunctionData("balanceOf", [walletAddress]),
  }
}
