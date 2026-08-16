import { describe, it, expect } from "vitest"
import { SUB_WALLET_PRESETS, ERC20_ABI, ERC721_ABI, ERC1155_ABI } from "~/lib/constants"

describe("SUB_WALLET_PRESETS", () => {
  it("has expected values", () => {
    expect([...SUB_WALLET_PRESETS]).toEqual([1, 10, 25, 50, 100])
  })

  it("is sorted ascending", () => {
    for (let i = 1; i < SUB_WALLET_PRESETS.length; i++) {
      expect(SUB_WALLET_PRESETS[i]).toBeGreaterThan(SUB_WALLET_PRESETS[i - 1])
    }
  })
})

describe("ABIs", () => {
  it("ERC20 has balanceOf and transfer", () => {
    expect(ERC20_ABI.some((s) => s.includes("balanceOf"))).toBe(true)
    expect(ERC20_ABI.some((s) => s.includes("transfer"))).toBe(true)
  })

  it("ERC721 has ownerOf and mint", () => {
    expect(ERC721_ABI.some((s) => s.includes("ownerOf"))).toBe(true)
    expect(ERC721_ABI.some((s) => s.includes("mint"))).toBe(true)
  })

  it("ERC1155 has balanceOfBatch", () => {
    expect(ERC1155_ABI.some((s) => s.includes("balanceOfBatch"))).toBe(true)
  })
})
