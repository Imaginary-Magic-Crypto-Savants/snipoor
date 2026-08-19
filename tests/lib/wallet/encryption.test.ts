import { describe, it, expect } from "vitest"
import { encrypt, decrypt } from "~/lib/wallet/encryption"

describe("encrypt/decrypt", () => {
  it("round-trips plaintext", async () => {
    const plaintext = "test mnemonic phrase here"
    const password = "strongpassword123"
    const payload = await encrypt(plaintext, password)
    const result = await decrypt(payload, password)
    expect(result).toBe(plaintext)
  })

  it("produces different ciphertexts for same input (random salt/iv)", async () => {
    const plaintext = "same data"
    const password = "pass"
    const a = await encrypt(plaintext, password)
    const b = await encrypt(plaintext, password)
    expect(a.ciphertext).not.toBe(b.ciphertext)
  })

  it("fails with wrong password", async () => {
    const payload = await encrypt("secret", "correct-password")
    await expect(decrypt(payload, "wrong-password")).rejects.toThrow()
  })

  it("handles empty string", async () => {
    const payload = await encrypt("", "password")
    const result = await decrypt(payload, "password")
    expect(result).toBe("")
  })

  it("handles unicode", async () => {
    const text = "wallet phrase with unicode"
    const payload = await encrypt(text, "pass")
    expect(await decrypt(payload, "pass")).toBe(text)
  })

  it("payload has expected fields", async () => {
    const payload = await encrypt("data", "pass")
    expect(payload).toHaveProperty("ciphertext")
    expect(payload).toHaveProperty("iv")
    expect(payload).toHaveProperty("salt")
    expect(typeof payload.ciphertext).toBe("string")
    expect(typeof payload.iv).toBe("string")
    expect(typeof payload.salt).toBe("string")
  })
})
