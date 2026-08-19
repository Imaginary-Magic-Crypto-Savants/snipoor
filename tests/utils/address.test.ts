import { describe, it, expect } from "vitest"
import { shortenAddress } from "~/utils/address"

describe("shortenAddress", () => {
  const addr = "0x1234567890abcdef1234567890abcdef12345678"

  it("shortens with default chars", () => {
    expect(shortenAddress(addr)).toBe("0x1234...5678")
  })

  it("shortens with custom chars", () => {
    expect(shortenAddress(addr, 6)).toBe("0x123456...345678")
  })

  it("handles short input", () => {
    expect(shortenAddress("0xabc", 2)).toBe("0xab...bc")
  })
})
