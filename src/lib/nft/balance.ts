import { Interface, AbiCoder } from "ethers"
import { multicall, type Call3 } from "~/lib/chain/multicall"
import { withRetry } from "~/lib/chain/provider"
import { getAlchemyKeyForChain, markAlchemyKeyThrottled } from "~/lib/api/keys"

const ERC721_IFACE = new Interface([
  "function balanceOf(address owner) view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function supportsInterface(bytes4 interfaceId) view returns (bool)",
])

const coder = AbiCoder.defaultAbiCoder()

const ALCHEMY_CHAINS: Record<number, string> = {
  1: "eth-mainnet",
  8453: "base-mainnet",
  42161: "arb-mainnet",
  4663: "robinhood-mainnet",
}

export interface WalletNFTBalance {
  address: string
  count: number
  tokenIds: number[]
}

export interface NFTContractInfo {
  address: string
  name: string
  symbol: string
  isEnumerable: boolean
}

export async function getContractInfo(chainId: number, contractAddress: string): Promise<NFTContractInfo> {
  return withRetry(chainId, async () => {
    const calls: Call3[] = [
      { target: contractAddress, allowFailure: true, callData: ERC721_IFACE.encodeFunctionData("name") },
      { target: contractAddress, allowFailure: true, callData: ERC721_IFACE.encodeFunctionData("symbol") },
      { target: contractAddress, allowFailure: true, callData: ERC721_IFACE.encodeFunctionData("supportsInterface", ["0x780e9d63"]) },
    ]
    const results = await multicall(chainId, calls)

    let name = "Unknown"
    let symbol = "???"
    let isEnumerable = false

    if (results[0].success) try { name = coder.decode(["string"], results[0].returnData)[0] } catch {}
    if (results[1].success) try { symbol = coder.decode(["string"], results[1].returnData)[0] } catch {}
    if (results[2].success) try { isEnumerable = coder.decode(["bool"], results[2].returnData)[0] } catch {}

    return { address: contractAddress, name, symbol, isEnumerable }
  })
}

// getNFTsForOwner caps at 100 results per page and returns a pageKey when more
// exist. A wallet holding more than one page of the same collection (common
// after a big mint into a handful of wallets) would silently lose every token
// past the first page — undercounting both the balance display and, worse,
// the consolidate transfer list, with no error surfaced anywhere.
const NFT_PAGE_MAX = 50 // hard stop against a runaway loop; 50 x 100 = 5000 tokens/wallet

async function fetchOwnedNftsAllPages(
  network: string,
  key: string,
  contractAddress: string,
  addr: string
): Promise<{ tokenIds: number[] }> {
  const tokenIds: number[] = []
  let pageKey: string | undefined
  for (let page = 0; page < NFT_PAGE_MAX; page++) {
    const url =
      `https://${network}.g.alchemy.com/nft/v3/${key}/getNFTsForOwner?owner=${addr}` +
      `&contractAddresses[]=${contractAddress}&withMetadata=false` +
      (pageKey ? `&pageKey=${encodeURIComponent(pageKey)}` : "")
    const res = await fetch(url)
    if (!res.ok) {
      const err = new Error(`Alchemy ${res.status}`) as Error & { status: number }
      err.status = res.status
      throw err
    }
    const data = await res.json()
    const nfts = data.ownedNfts ?? []
    tokenIds.push(...nfts.map((nft: { tokenId: string }) => Number(nft.tokenId)))
    if (!data.pageKey) break
    pageKey = data.pageKey
  }
  return { tokenIds }
}

async function fetchViaAlchemy(
  chainId: number,
  contractAddress: string,
  walletAddresses: string[]
): Promise<WalletNFTBalance[] | null> {
  const key = await getAlchemyKeyForChain(chainId)
  if (!key) return null
  const network = ALCHEMY_CHAINS[chainId]
  if (!network) return null

  const results = await Promise.allSettled(
    walletAddresses.map(async (addr) => {
      try {
        const { tokenIds } = await fetchOwnedNftsAllPages(network, key, contractAddress, addr)
        return { address: addr, count: tokenIds.length, tokenIds }
      } catch (e) {
        // Park this key so the next call rotates to another free key (or the
        // pay-as-you-go overflow only if all free keys are throttled).
        const status = (e as { status?: number }).status
        if (status === 429 || status === 401 || status === 403) markAlchemyKeyThrottled(key)
        throw e
      }
    })
  )

  const allFailed = results.every((r) => r.status === "rejected")
  if (allFailed) return null

  return results.map((r, i) =>
    r.status === "fulfilled" ? r.value : { address: walletAddresses[i], count: 0, tokenIds: [] }
  )
}

async function fetchViaMulticall(
  chainId: number,
  contractAddress: string,
  walletAddresses: string[]
): Promise<WalletNFTBalance[]> {
  const calls: Call3[] = walletAddresses.map((addr) => ({
    target: contractAddress,
    allowFailure: true,
    callData: ERC721_IFACE.encodeFunctionData("balanceOf", [addr]),
  }))

  const results = await multicall(chainId, calls)

  return walletAddresses.map((addr, i) => {
    let count = 0
    if (results[i].success) try { count = Number(coder.decode(["uint256"], results[i].returnData)[0]) } catch {}
    return { address: addr, count, tokenIds: [] }
  })
}

export async function getNFTBalances(
  chainId: number,
  contractAddress: string,
  walletAddresses: string[]
): Promise<WalletNFTBalance[]> {
  if (walletAddresses.length === 0) return []

  const alchemyResult = await fetchViaAlchemy(chainId, contractAddress, walletAddresses)
  if (alchemyResult) return alchemyResult

  return withRetry(chainId, () => fetchViaMulticall(chainId, contractAddress, walletAddresses))
}
