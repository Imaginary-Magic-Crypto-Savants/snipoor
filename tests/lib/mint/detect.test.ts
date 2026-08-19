import { describe, it, expect } from "vitest"
import { detectMintFunctions } from "~/lib/mint/detector"
import { extractSelectorsFromBytecode } from "~/lib/chain/proxy"

const fn = (name: string, inputs: Array<{ name: string; type: string }>, mut = "payable") => ({
  type: "function",
  name,
  stateMutability: mut,
  inputs,
  outputs: [],
})

describe("detectMintFunctions exclusions", () => {
  it("never auto-selects mintSeaDrop (callback-only, reverts for EOAs)", () => {
    const abi = JSON.stringify([
      fn("mintSeaDrop", [{ name: "minter", type: "address" }, { name: "quantity", type: "uint256" }]),
    ])
    const found = detectMintFunctions(abi)
    expect(found.find((f) => f.name === "mintSeaDrop")).toBeUndefined()
  })

  it("excludes privileged/admin mints", () => {
    const abi = JSON.stringify([
      fn("ownerMint", [{ name: "quantity", type: "uint256" }]),
      fn("devMint", [{ name: "quantity", type: "uint256" }]),
      fn("teamMint", [{ name: "quantity", type: "uint256" }]),
      fn("reserveMint", [{ name: "quantity", type: "uint256" }]),
      fn("airdropMint", [{ name: "quantity", type: "uint256" }]),
    ])
    const found = detectMintFunctions(abi)
    expect(found).toHaveLength(0)
  })

  it("still detects a normal public mint(uint256)", () => {
    const abi = JSON.stringify([fn("mint", [{ name: "quantity", type: "uint256" }])])
    const found = detectMintFunctions(abi)
    expect(found[0]?.name).toBe("mint")
    expect(found[0]?.signature).toBe("mint(uint256)")
  })

  it("ranks the cleanest candidate first", () => {
    const abi = JSON.stringify([
      fn("mint", [{ name: "quantity", type: "uint256" }, { name: "proof", type: "bytes32[]" }]),
      fn("mint", [{ name: "quantity", type: "uint256" }]),
    ])
    const found = detectMintFunctions(abi)
    // The proofless single-quantity variant should outrank the merkle variant.
    expect(found[0]?.signature).toBe("mint(uint256)")
  })
})

describe("extractSelectorsFromBytecode", () => {
  it("finds SeaDrop fingerprint selectors embedded in bytecode", () => {
    // PUSH4 0x64869dad (mintSeaDrop) and PUSH4 0x840e15d4 (getMintStats)
    const code = "0x6080604052" + "63" + "64869dad" + "14" + "6300112233" + "63" + "840e15d4" + "14"
    const sels = extractSelectorsFromBytecode(code)
    expect(sels.has("0x64869dad")).toBe(true)
    expect(sels.has("0x840e15d4")).toBe(true)
  })

  it("returns empty set for an EOA / no bytecode", () => {
    expect(extractSelectorsFromBytecode("0x").size).toBe(0)
    expect(extractSelectorsFromBytecode("0x00").size).toBe(0)
  })
})
