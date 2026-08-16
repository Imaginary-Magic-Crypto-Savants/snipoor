import { Wallet, parseEther, formatEther, Interface } from "ethers"
import { getProvider, withRetry } from "~/lib/chain/provider"
import { buildFeeData } from "~/lib/chain/gas"
import { analyzeTxError, explainTxError, isRetryable } from "~/lib/chain/errors"
import type { MintConfig, MintResult } from "./types"

const BATCH_DELAY_MS = 400
const RECEIPT_POLL_MS = 3000
const RECEIPT_MAX_POLLS = 40
const MAX_MINT_ATTEMPTS = 4
// Per-RPC-call retry cap inside the mint loop. The outer attempt loop already
// retries with error-specific fixes, so deep inner retries just multiply: 4
// outer × 5 calls × default ~6 RPC attempts × 12s timeout = multi-minute hangs
// per wallet on a degraded network. 2 inner attempts keeps worst case bounded.
const MINT_RPC_ATTEMPTS = 2

function getBatchSize(total: number): number {
  if (total <= 10) return total
  if (total <= 50) return 5
  return 3
}

function bumpFee(
  fee: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint },
  factorPct: number
): { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint } {
  const f = BigInt(Math.round(factorPct))
  return {
    maxFeePerGas: (fee.maxFeePerGas * f) / 100n,
    maxPriorityFeePerGas: (fee.maxPriorityFeePerGas * f) / 100n,
  }
}

export type MintProgressCallback = (current: number, total: number) => void

// Sends one wallet's mint with self-healing recovery. Transient/fixable failures
// (nonce desync, stuck mempool tx, gas price/limit too low, RPC throttling) are
// retried with the appropriate fix applied. Terminal failures (insufficient
// funds, contract revert, timeout) return immediately with a clear message.
async function mintWallet(
  wk: { address: string; privateKey: string },
  config: MintConfig,
  calldata: string,
  value: bigint,
  baseFee: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }
): Promise<MintResult> {
  const cid = config.chainId

  let fee = baseFee
  let gasBufferPct = 120 // estimate * 1.2 by default; escalates on out-of-gas
  let feeBumpPct = 100   // escalates on gas-price-low / replacement-underpriced
  let lastError = "Mint failed"

  for (let attempt = 0; attempt < MAX_MINT_ATTEMPTS; attempt++) {
    try {
      // --- Nonce + stuck-tx detection -------------------------------------
      // If the wallet has a tx wedged in the mempool, `pending` sits one (or
      // more) ahead of `latest`. Minting at the `latest` slot with higher gas
      // REPLACES the stuck tx instead of queuing behind it forever — the same
      // outcome users got by accident via consolidate/disperse, made deliberate.
      const [pendingCount, latestCount] = await Promise.all([
        withRetry(cid, () => getProvider(cid).getTransactionCount(wk.address, "pending"), MINT_RPC_ATTEMPTS),
        withRetry(cid, () => getProvider(cid).getTransactionCount(wk.address, "latest"), MINT_RPC_ATTEMPTS),
      ])
      const hasStuckTx = pendingCount > latestCount
      const nonce = hasStuckTx ? latestCount : pendingCount

      // Replacing a stuck tx requires out-bidding it; force an aggressive bump.
      const effectiveFee = hasStuckTx && feeBumpPct < 130 ? bumpFee(fee, 130) : bumpFee(fee, feeBumpPct)

      // --- Gas limit ------------------------------------------------------
      let gasLimit: bigint
      if (config.gasLimit && gasBufferPct === 120) {
        gasLimit = BigInt(config.gasLimit)
      } else {
        const estimated = await withRetry(cid, () =>
          getProvider(cid).estimateGas({
            to: config.contractAddress,
            data: calldata,
            value,
            from: wk.address,
          }), MINT_RPC_ATTEMPTS
        )
        gasLimit = (estimated * BigInt(gasBufferPct)) / 100n
      }

      // --- Pre-flight balance check (terminal) ----------------------------
      const maxCost = value + gasLimit * effectiveFee.maxFeePerGas
      const balance = await withRetry(cid, () => getProvider(cid).getBalance(wk.address), MINT_RPC_ATTEMPTS)
      if (balance < maxCost) {
        const need = Number(formatEther(maxCost)).toFixed(5)
        const have = Number(formatEther(balance)).toFixed(5)
        const shortBy = Number(formatEther(maxCost - balance)).toFixed(5)
        return {
          address: wk.address,
          hash: "",
          status: "failed",
          error: `Insufficient ETH: needs ~${need} (mint + gas) but wallet holds ${have}. Short by ${shortBy} ETH.`,
        }
      }

      // --- Send -----------------------------------------------------------
      const tx = await withRetry(cid, () => {
        const wallet = new Wallet(wk.privateKey, getProvider(cid))
        return wallet.sendTransaction({
          to: config.contractAddress,
          data: calldata,
          value,
          nonce,
          gasLimit,
          maxFeePerGas: effectiveFee.maxFeePerGas,
          maxPriorityFeePerGas: effectiveFee.maxPriorityFeePerGas,
          type: 2,
        })
      }, MINT_RPC_ATTEMPTS)

      return { address: wk.address, hash: tx.hash, status: "pending" }
    } catch (e) {
      const { kind, message } = analyzeTxError(e)
      lastError = message

      // Terminal, or out of attempts: stop and surface the reason.
      if (!isRetryable(kind) || attempt === MAX_MINT_ATTEMPTS - 1) {
        return { address: wk.address, hash: "", status: "failed", error: message }
      }

      // Apply the fix for the next attempt.
      if (kind === "gas_price_low" || kind === "nonce") {
        feeBumpPct = Math.min(feeBumpPct + 30, 250) // out-bid stuck/underpriced txs
        fee = await buildFeeData(cid, config.speed).catch(() => fee) // refresh base too
      } else if (kind === "gas_limit_low") {
        gasBufferPct = Math.min(gasBufferPct + 40, 300) // ignore manual cap, re-estimate higher
      } else if (kind === "rate_limit" || kind === "network") {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
      }
    }
  }

  return { address: wk.address, hash: "", status: "failed", error: lastError }
}

async function pollReceipts(
  chainId: number,
  results: MintResult[]
): Promise<MintResult[]> {
  const pending = results.filter((r) => r.hash)
  if (pending.length === 0) return results

  const batchSize = getBatchSize(pending.length)

  for (let poll = 0; poll < RECEIPT_MAX_POLLS; poll++) {
    const stillPending = pending.filter((r) => r.status === "pending" && r.hash)
    if (stillPending.length === 0) break

    await new Promise((r) => setTimeout(r, RECEIPT_POLL_MS))

    for (let i = 0; i < stillPending.length; i += batchSize) {
      const batch = stillPending.slice(i, i + batchSize)
      await Promise.all(
        batch.map(async (r) => {
          try {
            const receipt = await getProvider(chainId).getTransactionReceipt(r.hash)
            if (receipt) {
              r.status = receipt.status === 1 ? "confirmed" : "failed"
              r.gasUsed = receipt.gasUsed.toString()
              if (receipt.status !== 1) {
                r.error = "Reverted on-chain (mined but failed). Likely wrong mint price, sold out, max-per-wallet hit, or not on allowlist."
              }
            }
          } catch {
            // will retry next poll
          }
        })
      )
    }
  }

  for (const r of pending) {
    if (r.status === "pending") {
      r.status = "timeout"
      r.error = "Tx sent but not confirmed in time. It may still land — check Activity before retrying."
    }
  }

  return results
}

function resolveArgs(args: unknown[], callerAddress: string): unknown[] {
  return args.map((a) => (a === "{{CALLER}}" ? callerAddress : a))
}

export async function executeMint(
  config: MintConfig,
  walletKeys: Array<{ address: string; privateKey: string }>,
  abiJson: string,
  onProgress?: MintProgressCallback
): Promise<MintResult[]> {
  const iface = new Interface(JSON.parse(abiJson))
  const hasCallerPlaceholder = config.args.some((a) => a === "{{CALLER}}")
  const sharedCalldata = hasCallerPlaceholder ? null : iface.encodeFunctionData(config.functionName, config.args)
  const value = parseEther(config.value || "0")
  const feeData = await buildFeeData(config.chainId, config.speed)

  const allResults: MintResult[] = []
  const batchSize = getBatchSize(walletKeys.length)

  for (let i = 0; i < walletKeys.length; i += batchSize) {
    const batch = walletKeys.slice(i, i + batchSize)

    const batchResults = await Promise.all(
      batch.map(async (wk) => {
        try {
          const calldata = sharedCalldata ?? iface.encodeFunctionData(config.functionName, resolveArgs(config.args, wk.address))
          return await mintWallet(wk, config, calldata, value, feeData)
        } catch (e) {
          return {
            address: wk.address,
            hash: "",
            status: "failed" as const,
            error: explainTxError(e),
          }
        }
      })
    )

    allResults.push(...batchResults)
    onProgress?.(allResults.length, walletKeys.length)

    if (i + batchSize < walletKeys.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS))
    }
  }

  return pollReceipts(config.chainId, allResults)
}

export interface ClearStuckResult {
  address: string
  cleared: boolean
  hash?: string
  message: string
}

// Cancels a wallet's wedged mempool tx by broadcasting a 0-ETH self-transfer at
// the stuck nonce with aggressively bumped gas. Deterministic replacement —
// the proper alternative to consolidate/disperse for unsticking a wallet.
export async function clearStuckTx(
  chainId: number,
  wk: { address: string; privateKey: string }
): Promise<ClearStuckResult> {
  try {
    const [pendingCount, latestCount] = await Promise.all([
      withRetry(chainId, () => getProvider(chainId).getTransactionCount(wk.address, "pending")),
      withRetry(chainId, () => getProvider(chainId).getTransactionCount(wk.address, "latest")),
    ])

    if (pendingCount <= latestCount) {
      return { address: wk.address, cleared: false, message: "No stuck tx — wallet nonce is clean." }
    }

    // Out-bid the stuck tx: turbo fee, bumped 50% to clear the replacement floor.
    const fee = bumpFee(await buildFeeData(chainId, "turbo"), 150)
    const balance = await withRetry(chainId, () => getProvider(chainId).getBalance(wk.address))
    const cancelGas = 21000n
    const cost = cancelGas * fee.maxFeePerGas
    if (balance < cost) {
      return {
        address: wk.address,
        cleared: false,
        message: `Can't clear: needs ~${Number(formatEther(cost)).toFixed(5)} ETH for cancel gas, holds ${Number(formatEther(balance)).toFixed(5)}.`,
      }
    }

    const tx = await withRetry(chainId, () => {
      const wallet = new Wallet(wk.privateKey, getProvider(chainId))
      return wallet.sendTransaction({
        to: wk.address,
        value: 0n,
        nonce: latestCount,
        gasLimit: cancelGas,
        maxFeePerGas: fee.maxFeePerGas,
        maxPriorityFeePerGas: fee.maxPriorityFeePerGas,
        type: 2,
      })
    })

    const stuckCount = pendingCount - latestCount
    return {
      address: wk.address,
      cleared: true,
      hash: tx.hash,
      message: `Sent cancel for ${stuckCount} stuck tx. Wallet unblocked once it confirms.`,
    }
  } catch (e) {
    return { address: wk.address, cleared: false, message: explainTxError(e) }
  }
}
