import { Wallet, Contract } from "ethers"
import { getProvider, withRetry } from "~/lib/chain/provider"
import { buildFeeData } from "~/lib/chain/gas"
import type { SpeedTier } from "~/lib/wallet/types"

const ERC721_TRANSFER_ABI = [
  "function safeTransferFrom(address from, address to, uint256 tokenId)",
]

const WALLET_BATCH_SIZE = 3
const WALLET_BATCH_DELAY_MS = 500

export interface NFTTransferResult {
  from: string
  tokenId: number
  hash: string
  status: "confirmed" | "failed"
  gasUsed?: string
  error?: string
}

export type NFTConsolidateProgressCallback = (current: number, total: number) => void

async function consolidateWallet(
  chainId: number,
  contractAddress: string,
  transfer: { fromAddress: string; fromPrivateKey: string; tokenIds: number[] },
  destination: string,
  feeData: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint },
  onToken: () => void
): Promise<NFTTransferResult[]> {
  const provider = getProvider(chainId)
  const wallet = new Wallet(transfer.fromPrivateKey, provider)

  const nonce = await withRetry(chainId, () =>
    provider.getTransactionCount(wallet.address, "pending")
  )

  const results: NFTTransferResult[] = []
  let currentNonce = nonce

  for (let i = 0; i < transfer.tokenIds.length; i++) {
    const tokenId = transfer.tokenIds[i]
    const w = new Wallet(transfer.fromPrivateKey, getProvider(chainId))
    const c = new Contract(contractAddress, ERC721_TRANSFER_ABI, w)

    let tx: { hash: string; wait: () => Promise<{ status: number; gasUsed: bigint } | null> }
    try {
      tx = await c.safeTransferFrom(
        transfer.fromAddress,
        destination,
        tokenId,
        {
          nonce: currentNonce,
          maxFeePerGas: feeData.maxFeePerGas,
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
          type: 2,
        }
      )
      currentNonce++
    } catch (e) {
      results.push({
        from: transfer.fromAddress,
        tokenId,
        hash: "",
        status: "failed",
        error: e instanceof Error ? e.message : "Transfer failed before broadcast",
      })
      onToken()
      for (const skippedTokenId of transfer.tokenIds.slice(i + 1)) {
        results.push({
          from: transfer.fromAddress,
          tokenId: skippedTokenId,
          hash: "",
          status: "failed",
          error: "Skipped due to prior nonce failure",
        })
        onToken()
      }
      break
    }

    try {
      const receipt = await tx.wait()
      results.push({
        from: transfer.fromAddress,
        tokenId,
        hash: tx.hash,
        status: receipt?.status === 1 ? "confirmed" : "failed",
        gasUsed: receipt?.gasUsed.toString(),
      })
    } catch (e) {
      results.push({
        from: transfer.fromAddress,
        tokenId,
        hash: "",
        status: "failed",
        error: e instanceof Error ? e.message : "Transfer failed",
      })
    }
    onToken()
  }

  return results
}

export async function consolidateNFTs(
  chainId: number,
  contractAddress: string,
  transfers: Array<{ fromAddress: string; fromPrivateKey: string; tokenIds: number[] }>,
  destination: string,
  speed: SpeedTier,
  onProgress?: NFTConsolidateProgressCallback
): Promise<NFTTransferResult[]> {
  const feeData = await buildFeeData(chainId, speed)
  const allResults: NFTTransferResult[] = []
  const total = transfers.reduce((sum, t) => sum + t.tokenIds.length, 0)
  let done = 0
  const onToken = () => onProgress?.(++done, total)

  for (let i = 0; i < transfers.length; i += WALLET_BATCH_SIZE) {
    const batch = transfers.slice(i, i + WALLET_BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map((transfer) =>
        consolidateWallet(chainId, contractAddress, transfer, destination, feeData, onToken)
      )
    )
    allResults.push(...batchResults.flat())

    if (i + WALLET_BATCH_SIZE < transfers.length) {
      await new Promise((r) => setTimeout(r, WALLET_BATCH_DELAY_MS))
    }
  }

  return allResults
}
