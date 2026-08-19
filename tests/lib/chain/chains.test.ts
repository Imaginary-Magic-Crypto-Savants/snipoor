import { describe, it, expect } from "vitest"
import { CHAINS, CHAIN_IDS, DEFAULT_CHAIN_ID, getChainByName } from "~/lib/chain/chains"

describe("CHAINS config", () => {
  it("has ethereum, base, arbitrum", () => {
    expect(CHAINS[1]).toBeDefined()
    expect(CHAINS[8453]).toBeDefined()
    expect(CHAINS[42161]).toBeDefined()
  })

  it("each chain has required fields", () => {
    for (const chain of Object.values(CHAINS)) {
      expect(chain.chainId).toBeTypeOf("number")
      expect(chain.name).toBeTypeOf("string")
      expect(chain.symbol).toBe("ETH")
      expect(chain.rpcDefault).toMatch(/^https:\/\//)
      expect(chain.explorerUrl).toMatch(/^https:\/\//)
    }
  })

  it("CHAIN_IDS matches CHAINS keys", () => {
    expect(CHAIN_IDS.sort()).toEqual(Object.keys(CHAINS).map(Number).sort())
  })

  it("default chain is ethereum", () => {
    expect(DEFAULT_CHAIN_ID).toBe(1)
  })
})

describe("getChainByName", () => {
  it("finds by exact name", () => {
    expect(getChainByName("Ethereum")?.chainId).toBe(1)
  })

  it("case insensitive", () => {
    expect(getChainByName("base")?.chainId).toBe(8453)
    expect(getChainByName("ARBITRUM")?.chainId).toBe(42161)
  })

  it("returns undefined for unknown", () => {
    expect(getChainByName("Solana")).toBeUndefined()
  })
})
