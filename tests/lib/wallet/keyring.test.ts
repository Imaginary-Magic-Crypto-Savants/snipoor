import { describe, it, expect } from "vitest"
import {
  generateMnemonic,
  deriveWallets,
  importPrivateKey,
  validateMnemonic,
  validatePrivateKey,
} from "~/lib/wallet/keyring"

describe("generateMnemonic", () => {
  it("returns 12-word phrase", () => {
    const phrase = generateMnemonic()
    expect(phrase.split(" ")).toHaveLength(12)
  })

  it("generates unique phrases", () => {
    const a = generateMnemonic()
    const b = generateMnemonic()
    expect(a).not.toBe(b)
  })
})

describe("validateMnemonic", () => {
  it("accepts valid 12-word phrase", () => {
    const phrase = generateMnemonic()
    expect(validateMnemonic(phrase)).toBe(true)
  })

  it("rejects garbage", () => {
    expect(validateMnemonic("not a valid mnemonic phrase at all")).toBe(false)
  })

  it("rejects empty string", () => {
    expect(validateMnemonic("")).toBe(false)
  })
})

describe("deriveWallets", () => {
  const mnemonic = generateMnemonic()

  it("derives requested count", () => {
    const wallets = deriveWallets(mnemonic, 5)
    expect(wallets).toHaveLength(5)
  })

  it("first wallet has index 0", () => {
    const wallets = deriveWallets(mnemonic, 1)
    expect(wallets[0].index).toBe(0)
    expect(wallets[0].path).toBe("m/44'/60'/0'/0/0")
  })

  it("produces valid eth addresses", () => {
    const wallets = deriveWallets(mnemonic, 3)
    for (const w of wallets) {
      expect(w.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(w.privateKey).toMatch(/^0x[0-9a-fA-F]{64}$/)
    }
  })

  it("is deterministic", () => {
    const a = deriveWallets(mnemonic, 3)
    const b = deriveWallets(mnemonic, 3)
    expect(a.map((w) => w.address)).toEqual(b.map((w) => w.address))
  })

  it("different mnemonics produce different wallets", () => {
    const other = generateMnemonic()
    const a = deriveWallets(mnemonic, 1)
    const b = deriveWallets(other, 1)
    expect(a[0].address).not.toBe(b[0].address)
  })
})

describe("importPrivateKey", () => {
  it("imports hex key with 0x prefix", () => {
    const mnemonic = generateMnemonic()
    const derived = deriveWallets(mnemonic, 1)[0]
    const result = importPrivateKey(derived.privateKey)
    expect(result.address).toBe(derived.address)
  })

  it("imports hex key without 0x prefix", () => {
    const mnemonic = generateMnemonic()
    const derived = deriveWallets(mnemonic, 1)[0]
    const stripped = derived.privateKey.slice(2)
    const result = importPrivateKey(stripped)
    expect(result.address).toBe(derived.address)
  })

  it("throws on invalid key", () => {
    expect(() => importPrivateKey("not-a-key")).toThrow()
  })
})

describe("validatePrivateKey", () => {
  it("accepts valid key", () => {
    const wallet = deriveWallets(generateMnemonic(), 1)[0]
    expect(validatePrivateKey(wallet.privateKey)).toBe(true)
  })

  it("rejects garbage", () => {
    expect(validatePrivateKey("xyz")).toBe(false)
  })
})
