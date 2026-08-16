import { getApiKey } from "~/lib/api/keys"

const ETHERSCAN_V2 = "https://api.etherscan.io/v2/api"

export async function fetchContractABI(chainId: number, contractAddress: string): Promise<string> {
  const apiKey = await getApiKey("etherscan")
  if (!apiKey) {
    throw new Error("Etherscan API key required. Add your key in Settings or .env file (ETHERSCAN_KEY_1)")
  }

  const params = new URLSearchParams({
    chainid: String(chainId),
    module: "contract",
    action: "getabi",
    address: contractAddress,
    apikey: apiKey,
  })

  const res = await fetch(`${ETHERSCAN_V2}?${params}`)
  if (!res.ok) {
    throw new Error(`Etherscan returned ${res.status}. Try again.`)
  }

  const data = await res.json()

  if (data.status !== "1" || !data.result) {
    const msg = typeof data.result === "string" ? data.result : "Failed to fetch ABI"
    if (msg.includes("Invalid API Key")) {
      throw new Error("Invalid Etherscan API key. Check your key in Settings or .env")
    }
    if (msg.includes("not verified")) {
      throw new Error("Contract not verified on Etherscan. Paste ABI manually.")
    }
    throw new Error(msg)
  }

  return data.result
}

export async function isContractVerified(chainId: number, contractAddress: string): Promise<boolean> {
  try {
    await fetchContractABI(chainId, contractAddress)
    return true
  } catch {
    return false
  }
}
