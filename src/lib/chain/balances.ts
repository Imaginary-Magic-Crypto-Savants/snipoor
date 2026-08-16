import { formatUnits } from "ethers"
import { CHAIN_IDS } from "./chains"
import { multicall, encodeGetEthBalance, encodeERC20BalanceOf, decodeUint256 } from "./multicall"
import { withBalanceRetry } from "./provider"
import type { JsonRpcProvider } from "ethers"
import { TOKEN_ADDRESSES, TOKEN_DECIMALS } from "./tokens"
import type { AggregatedBalances, ChainBalances, TokenBalance } from "~/lib/wallet/types"

export type AllBalancesResult = Record<string, AggregatedBalances>

const BALANCE_MAX_ATTEMPTS = 3

interface RawChainBalances {
  eth: string
  weth: string
  usdc: string
}

function makeTokenBal(formatted: string, priceUsd: number): TokenBalance {
  return { formatted, usd: parseFloat(formatted) * priceUsd }
}

function buildChainBalances(raw: RawChainBalances, ethPriceUsd: number): ChainBalances {
  const eth = makeTokenBal(raw.eth, ethPriceUsd)
  const weth = makeTokenBal(raw.weth, ethPriceUsd)
  const usdc = makeTokenBal(raw.usdc, 1)
  return { ETH: eth, WETH: weth, USDC: usdc, totalUsd: eth.usd + weth.usd + usdc.usd }
}

async function fetchChainBalances(
  chainId: number,
  addresses: string[],
  provider: JsonRpcProvider
): Promise<Record<string, RawChainBalances>> {
  // Token contracts only exist on chains we've mapped. On chains without them
  // (e.g. Robinhood) we read native balance only — passing an undefined target
  // into the multicall would throw and sink the whole chain's balances.
  const wethAddr = TOKEN_ADDRESSES.WETH[chainId]
  const usdcAddr = TOKEN_ADDRESSES.USDC[chainId]
  const stride = 1 + (wethAddr ? 1 : 0) + (usdcAddr ? 1 : 0)
  const calls = []

  for (const addr of addresses) {
    calls.push(encodeGetEthBalance(addr))
    if (wethAddr) calls.push(encodeERC20BalanceOf(wethAddr, addr))
    if (usdcAddr) calls.push(encodeERC20BalanceOf(usdcAddr, addr))
  }

  const raw = await multicall(chainId, calls, provider)
  const result: Record<string, RawChainBalances> = {}

  for (let i = 0; i < addresses.length; i++) {
    const base = i * stride
    let offset = base
    const ethSlot = raw[offset++]
    const wethSlot = wethAddr ? raw[offset++] : undefined
    const usdcSlot = usdcAddr ? raw[offset++] : undefined
    result[addresses[i]] = {
      eth: ethSlot?.success ? formatUnits(decodeUint256(ethSlot.returnData), TOKEN_DECIMALS.ETH) : "0",
      weth: wethSlot?.success ? formatUnits(decodeUint256(wethSlot.returnData), TOKEN_DECIMALS.WETH) : "0",
      usdc: usdcSlot?.success ? formatUnits(decodeUint256(usdcSlot.returnData), TOKEN_DECIMALS.USDC) : "0",
    }
  }

  return result
}

export async function fetchAllBalances(
  addresses: string[],
  ethPriceUsd: number
): Promise<AllBalancesResult> {
  if (addresses.length === 0) return {}

  // withBalanceRetry: bounded attempts, rotates Alchemy keys via
  // pickBalanceProvider, and parks exactly the key that failed (withRetry would
  // mis-attribute failures to the general RPC pool).
  const chainResults = await Promise.allSettled(
    CHAIN_IDS.map((chainId) =>
      withBalanceRetry(chainId, (provider) => fetchChainBalances(chainId, addresses, provider), BALANCE_MAX_ATTEMPTS)
    )
  )

  const result: AllBalancesResult = {}
  for (const addr of addresses) {
    result[addr] = { byChain: {}, totalUsd: 0, totalEth: 0 }
  }

  for (let i = 0; i < CHAIN_IDS.length; i++) {
    const chainId = CHAIN_IDS[i]
    const settled = chainResults[i]
    if (settled.status === "rejected") continue

    for (const addr of addresses) {
      const raw = settled.value[addr]
      if (!raw) continue
      const chainBal = buildChainBalances(raw, ethPriceUsd)
      result[addr].byChain[chainId] = chainBal
      result[addr].totalUsd += chainBal.totalUsd
      result[addr].totalEth += parseFloat(raw.eth) + parseFloat(raw.weth)
    }
  }

  return result
}
