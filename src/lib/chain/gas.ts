import type { SpeedTier } from "~/lib/wallet/types"
import { getProvider } from "./provider"

const SPEED_MULTIPLIERS: Record<SpeedTier, { baseFee: number; priority: number }> = {
  normal: { baseFee: 1.0, priority: 1.0 },
  fast: { baseFee: 1.3, priority: 1.5 },
  turbo: { baseFee: 2.0, priority: 3.0 },
}

export async function buildFeeData(
  chainId: number,
  speed: SpeedTier
): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  const provider = getProvider(chainId)
  const feeData = await provider.getFeeData()
  const mult = SPEED_MULTIPLIERS[speed]

  const baseFee = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n
  const priority = feeData.maxPriorityFeePerGas ?? 1_000_000_000n

  return {
    maxFeePerGas: BigInt(Math.ceil(Number(baseFee) * mult.baseFee)),
    maxPriorityFeePerGas: BigInt(Math.ceil(Number(priority) * mult.priority)),
  }
}

export async function estimateGas(
  chainId: number,
  tx: { to: string; data?: string; value?: bigint; from?: string }
): Promise<bigint> {
  const provider = getProvider(chainId)
  return provider.estimateGas(tx)
}
