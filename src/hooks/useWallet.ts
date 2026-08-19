import { useState, useCallback, useEffect } from "react"
import { sendMessage, type WalletsData, type AllBalancesData } from "~/lib/messaging"
import type { WalletInfo } from "~/lib/wallet/types"

export function useWallet() {
  const [wallets, setWallets] = useState<WalletInfo[]>([])
  const [locked, setLocked] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [ethPriceUsd, setEthPriceUsd] = useState(0)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [balanceFetchedAt, setBalanceFetchedAt] = useState(0)

  const fetchBalances = useCallback(async (force = false) => {
    setBalanceLoading(true)
    const res = await sendMessage<AllBalancesData>({ type: "GET_ALL_BALANCES", payload: { force } })
    if (res.ok && res.data) {
      const data = res.data as AllBalancesData
      setWallets((prev) =>
        prev.map((w) => {
          const bal = data.balances[w.address]
          return {
            ...w,
            balance: bal ? bal.totalEth.toFixed(6) : w.balance,
            balances: bal ?? w.balances,
          }
        })
      )
      setEthPriceUsd(data.ethPriceUsd)
      setBalanceFetchedAt(Date.now())
    }
    setBalanceLoading(false)
    return res
  }, [])

  const refresh = useCallback(async () => {
    const res = await sendMessage<WalletsData>({ type: "GET_WALLETS" })
    if (res.ok && res.data) {
      setWallets(res.data.wallets)
      setLocked(res.data.locked)
      if (res.data.cachedEthPriceUsd) setEthPriceUsd(res.data.cachedEthPriceUsd)
      if (res.data.balanceFetchedAt) setBalanceFetchedAt(res.data.balanceFetchedAt)
    }
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const unlock = useCallback(async (password: string) => {
    setError("")
    setLoading(true)
    const res = await sendMessage<WalletsData>({ type: "UNLOCK", payload: { password } })
    if (res.ok && res.data) {
      setWallets(res.data.wallets)
      setLocked(false)
      if (res.data.cachedEthPriceUsd) setEthPriceUsd(res.data.cachedEthPriceUsd)
      if (res.data.balanceFetchedAt) setBalanceFetchedAt(res.data.balanceFetchedAt)
    } else if (!res.ok) {
      setError(res.error)
    }
    setLoading(false)
  }, [])

  const lock = useCallback(async () => {
    await sendMessage({ type: "LOCK" })
    setWallets([])
    setLocked(true)
  }, [])

  const createWallet = useCallback(async (mnemonic: string, password: string, subWalletCount: number) => {
    setError("")
    setLoading(true)
    const res = await sendMessage<WalletsData>({ type: "CREATE_WALLET", payload: { mnemonic, password, subWalletCount } })
    if (res.ok && res.data) {
      setWallets(res.data.wallets)
      setLocked(false)
    } else if (!res.ok) {
      setError(res.error)
    }
    setLoading(false)
    return res
  }, [])

  return { wallets, locked, loading, error, ethPriceUsd, balanceLoading, balanceFetchedAt, unlock, lock, createWallet, refresh, fetchBalances, setError }
}
