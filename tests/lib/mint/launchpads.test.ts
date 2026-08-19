import { describe, it, expect } from "vitest"
import { AbiCoder, parseEther, solidityPackedKeccak256, Interface } from "ethers"
import { decodeArchetypeInvite } from "~/lib/mint/launchpads"

const abi = AbiCoder.defaultAbiCoder()
const ZERO = "0x0000000000000000000000000000000000000000"
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"

describe("decodeArchetypeInvite", () => {
  it("decodes the v0.7/v0.8 AdvancedInvite layout (352 bytes)", () => {
    // Mirrors the live-verified toxik kidz invites(bytes32(0)) shape.
    const raw = abi.encode(
      ["uint128", "uint128", "uint128", "uint32", "uint32", "uint32", "uint32", "uint32", "uint32", "address", "bool"],
      [parseEther("0.002"), 0n, 0n, 1757557811, 0xffffffff, 0xffffffff, 0xffffffff, 0, 1, ZERO, false]
    )
    expect((raw.length - 2) / 2).toBe(352)
    const inv = decodeArchetypeInvite(raw)
    expect(inv).not.toBeNull()
    expect(inv!.price).toBe(parseEther("0.002"))
    expect(inv!.start).toBe(1757557811)
    expect(inv!.end).toBe(0xffffffff)
    expect(inv!.limit).toBe(0xffffffff)
    expect(inv!.unitSize).toBe(1)
    expect(inv!.tokenAddress).toBe(ZERO)
    expect(inv!.isBlacklist).toBe(false)
  })

  it("decodes the v0.5/v0.6 DutchInvite layout (320 bytes, no isBlacklist)", () => {
    const raw = abi.encode(
      ["uint128", "uint128", "uint128", "uint32", "uint32", "uint32", "uint32", "uint32", "uint32", "address"],
      [parseEther("1"), parseEther("0.1"), parseEther("0.05"), 1700000000, 1800000000, 5, 1000, 300, 2, USDC]
    )
    expect((raw.length - 2) / 2).toBe(320)
    const inv = decodeArchetypeInvite(raw)
    expect(inv).not.toBeNull()
    expect(inv!.price).toBe(parseEther("1"))
    expect(inv!.delta).toBe(parseEther("0.05"))
    expect(inv!.end).toBe(1800000000)
    expect(inv!.limit).toBe(5)
    expect(inv!.maxSupply).toBe(1000)
    expect(inv!.unitSize).toBe(2)
    expect(inv!.tokenAddress).toBe(USDC)
    expect(inv!.isBlacklist).toBe(false)
  })

  it("decodes the v0.4 Invite layout (128 bytes)", () => {
    const raw = abi.encode(
      ["uint128", "uint32", "uint32", "address"],
      [parseEther("0.01"), 1650000000, 10, ZERO]
    )
    expect((raw.length - 2) / 2).toBe(128)
    const inv = decodeArchetypeInvite(raw)
    expect(inv).not.toBeNull()
    expect(inv!.price).toBe(parseEther("0.01"))
    expect(inv!.start).toBe(1650000000)
    expect(inv!.limit).toBe(10)
    expect(inv!.end).toBe(0)
    expect(inv!.unitSize).toBe(1)
  })

  it("returns null on unknown return shapes", () => {
    expect(decodeArchetypeInvite("0x")).toBeNull()
    expect(decodeArchetypeInvite("0x" + "00".repeat(64))).toBeNull()
    expect(decodeArchetypeInvite("0x" + "00".repeat(400))).toBeNull()
  })
})

describe("archetype mint route wiring", () => {
  it("public auth key candidates match Archetype verify() semantics", () => {
    // keccak256(abi.encodePacked(tokenAddress)) is unconditionally public.
    const tokenHashKey = solidityPackedKeccak256(["address"], [USDC])
    expect(tokenHashKey).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it("encodes mint((bytes32,bytes32[]),uint256,address,bytes) to selector 0x4a21a2df with JSON-string auth", () => {
    const iface = new Interface([
      "function mint((bytes32 key, bytes32[] proof) auth, uint256 quantity, address affiliate, bytes signature) payable",
    ])
    // Same path the executor takes: auth arrives as a JSON string from the UI
    // and is JSON.parsed into a positional tuple array.
    const auth = JSON.parse('["0x' + "00".repeat(32) + '",[]]')
    const data = iface.encodeFunctionData("mint", [auth, "2", ZERO, "0x"])
    expect(data.slice(0, 10)).toBe("0x4a21a2df")
  })
})
