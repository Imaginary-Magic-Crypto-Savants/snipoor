import { Wallet, parseEther, formatEther } from "ethers"
import { getProvider, withRetry } from "~/lib/chain/provider"
import { buildFeeData, estimateGas } from "~/lib/chain/gas"
import type { SpeedTier } from "~/lib/wallet/types"
import type { TxResult } from "./types"

function getBatchSize(total: number): number {
  if (total <= 10) return total
  if (total <= 50) return 5
  return 3
}

const BATCH_DELAY_MS = 500

export type ProgressCallback = (current: number, total: number) => void

export async function fundSubWallets(
  chainId: number,
  masterPrivateKey: string,
  targets: string[],
  amountPerWallet: string,
  speed: SpeedTier,
  onProgress?: ProgressCallback
): Promise<TxResult[]> {
  const value = parseEther(amountPerWallet)

  const feeData = await buildFeeData(chainId, speed)
  const provider = getProvider(chainId)
  const wallet = new Wallet(masterPrivateKey, provider)
  let nonce = await withRetry(chainId, () =>
    getProvider(chainId).getTransactionCount(wallet.address, "pending")
  )

  const gasEstimate = await estimateGas(chainId, {
    to: targets[0],
    value,
    from: wallet.address,
  })

  const sent: TxResult[] = []
  const batchSize = getBatchSize(targets.length)
  let stopSending = false

  for (let i = 0; i < targets.length; i += batchSize) {
    if (stopSending) {
      for (let j = i; j < targets.length; j++) {
        sent.push({ hash: "", from: wallet.address, to: targets[j], status: "failed", error: "Skipped due to prior nonce failure" })
      }
      break
    }

    const batch = targets.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map((target) => {
        const currentNonce = nonce++
        return (async () => {
          try {
            const tx = await withRetry(chainId, () => {
              const w = new Wallet(masterPrivateKey, getProvider(chainId))
              return w.sendTransaction({
                to: target,
                value,
                nonce: currentNonce,
                gasLimit: gasEstimate,
                maxFeePerGas: feeData.maxFeePerGas,
                maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
                type: 2,
              })
            })
            return {
              hash: tx.hash,
              from: wallet.address,
              to: target,
              status: "pending" as const,
            }
          } catch (e) {
            return {
              hash: "",
              from: wallet.address,
              to: target,
              status: "failed" as const,
              error: e instanceof Error ? e.message : "Failed",
            }
          }
        })()
      })
    )

    const hasFailed = batchResults.some((r) => r.status === "failed")
    if (hasFailed) stopSending = true

    sent.push(...batchResults)
    onProgress?.(sent.length, targets.length)

    if (i + batchSize < targets.length && !stopSending) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS))
    }
  }

  return pollTxReceipts(chainId, sent)
}

export async function consolidateETH(
  chainId: number,
  subWalletKeys: Array<{ address: string; privateKey: string }>,
  destination: string,
  speed: SpeedTier,
  onProgress?: ProgressCallback
): Promise<TxResult[]> {
  const feeData = await buildFeeData(chainId, speed)
  const batchSize = getBatchSize(subWalletKeys.length)

  const balances: Array<{ address: string; privateKey: string; balance: bigint }> = []
  for (let i = 0; i < subWalletKeys.length; i += batchSize) {
    const batch = subWalletKeys.slice(i, i + batchSize)
    const results = await Promise.all(
      batch.map(async (sub) => ({
        ...sub,
        balance: await withRetry(chainId, () => getProvider(chainId).getBalance(sub.address)),
      }))
    )
    balances.push(...results)
    if (i + batchSize < subWalletKeys.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS))
    }
  }

  // Estimate gas per transfer instead of assuming 21000. On Arbitrum-style L2s
  // (e.g. Robinhood) a plain transfer costs well above 21000 gas units because
  // the L1 data fee is folded into gas, so a hardcoded 21000 limit fails.
  let gasUnits = 21000n
  try {
    gasUnits = await withRetry(chainId, () =>
      getProvider(chainId).estimateGas({ to: destination, value: 0n, from: subWalletKeys[0]?.address })
    )
  } catch {}
  // +25% buffer absorbs L1-fee drift between estimate and inclusion.
  const gasLimit = gasUnits + gasUnits / 4n
  const gasCost = gasLimit * feeData.maxFeePerGas
  const funded = balances.filter((b) => b.balance > gasCost)

  if (funded.length === 0) {
    return []
  }

  const sent: TxResult[] = []

  for (let i = 0; i < funded.length; i += batchSize) {
    const batch = funded.slice(i, i + batchSize)
    const batchResults = await Promise.all(
      batch.map(async (sub) => {
        try {
          const sendAmount = sub.balance - gasCost
          const nonce = await withRetry(chainId, () =>
            getProvider(chainId).getTransactionCount(sub.address, "pending")
          )
          const tx = await withRetry(chainId, () => {
            const wallet = new Wallet(sub.privateKey, getProvider(chainId))
            return wallet.sendTransaction({
              to: destination,
              value: sendAmount,
              nonce,
              gasLimit,
              maxFeePerGas: feeData.maxFeePerGas,
              maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
              type: 2,
            })
          })
          return {
            hash: tx.hash,
            from: sub.address,
            to: destination,
            status: "pending" as const,
          }
        } catch (e) {
          return {
            hash: "",
            from: sub.address,
            to: destination,
            status: "failed" as const,
            error: e instanceof Error ? e.message : "Failed",
          }
        }
      })
    )
    sent.push(...batchResults)
    onProgress?.(sent.length, funded.length)

    if (i + batchSize < funded.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS))
    }
  }

  return pollTxReceipts(chainId, sent)
}

async function pollTxReceipts(
  chainId: number,
  results: TxResult[],
  maxPolls = 40,
  intervalMs = 3000
): Promise<TxResult[]> {
  const withHash = results.filter((r) => r.hash && r.status === "pending")
  if (withHash.length === 0) return results

  for (let poll = 0; poll < maxPolls; poll++) {
    const pending = withHash.filter((r) => r.status === "pending")
    if (pending.length === 0) break

    await new Promise((r) => setTimeout(r, intervalMs))

    const batchSize = getBatchSize(pending.length)
    for (let i = 0; i < pending.length; i += batchSize) {
      const batch = pending.slice(i, i + batchSize)
      await Promise.all(
        batch.map(async (r) => {
          try {
            const receipt = await getProvider(chainId).getTransactionReceipt(r.hash)
            if (receipt) {
              r.status = receipt.status === 1 ? "confirmed" : "failed"
              r.gasUsed = receipt.gasUsed.toString()
              if (receipt.status !== 1) r.error = "Transaction reverted"
            }
          } catch {
            // retry next poll
          }
        })
      )
    }
  }

  for (const r of withHash) {
    if (r.status === "pending") r.status = "timeout"
  }

  return results
}

export async function exportAllKeys(
  wallets: Array<{ address: string; privateKey: string }>
): Promise<string> {
  return wallets.map((w) => `${w.address},${w.privateKey}`).join("\n")
}
