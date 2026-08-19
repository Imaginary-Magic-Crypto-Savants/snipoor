// Live integration check for the Scatter (Archetype) route. Hits mainnet, so it
// is OPT-IN: runs only when LIVE_RPC=1 (keeps the offline suite/CI hermetic).
//   LIVE_RPC=1 ALCHEMY_API_KEY_1=... npx vitest run tests/lib/mint/archetype.live.test.ts
//
// It exercises the SAME code the extension's DETECT_CONTRACT + EXECUTE_MINT run:
// the real detectContract() cascade (clone resolution + selector fingerprint +
// invites decode) against a live collection, then encodes the mint calldata the
// way MintPanel/executor do and simulates it with eth_call (a READ — reverts if
// the calldata/args are wrong, returns 0x if the mint would actually land). No
// broadcast, no ETH spent.
import { describe, it, expect } from "vitest"
import { JsonRpcProvider, Interface, parseEther } from "ethers"
import { detectContract } from "~/lib/mint/detect"

const LIVE = process.env.LIVE_RPC === "1"
const d = LIVE ? describe : describe.skip

// toxik kidz — verified Archetype v0.8 clone on ETH mainnet.
const CHAIN = 1
const NFT = "0xEB8eaC6b992edF0D4c32ecb9c61fc74E3c136F88"
// A funded address used only as the eth_call `from` so the value check passes.
// eth_call needs no signature; this proves calldata validity, not ownership.
const FUNDED_FROM = "0x28C6c06298d514Db089934071355E5743bf21d60" // Binance 14

d("Scatter (Archetype) live route", () => {
  it("detects the real contract through the extension cascade", async () => {
    const det = await detectContract(CHAIN, NFT, FUNDED_FROM, 2)
    expect(det.platform).toBe("Scatter (Archetype)")
    expect(det.method).toBe("launchpad")
    expect(det.callTarget.toLowerCase()).toBe(NFT.toLowerCase())
    expect(det.functions[0]?.name).toBe("mint")
    // auth prefilled to a public key + empty proof; affiliate zero; sig empty.
    expect(det.prefillArgs.affiliate).toBe("0x0000000000000000000000000000000000000000")
    expect(det.prefillArgs.signature).toBe("0x")
    const auth = JSON.parse(det.prefillArgs.auth)
    expect(Array.isArray(auth)).toBe(true)
    expect(auth[1]).toEqual([]) // empty proof for a public list
    expect(det.dropState?.maxSupply).toBeGreaterThan(0)
  }, 30_000)

  it("encodes the mint calldata to selector 0x4a21a2df and simulates without reverting", async () => {
    const det = await detectContract(CHAIN, NFT, FUNDED_FROM, 2)
    const fn = det.functions[0]!

    // Rebuild args exactly as MintPanel.handleExecute does: tuple/array types
    // arrive as JSON strings and are JSON.parsed; uints stay strings.
    const fnArgs = fn.inputs.map((input) => {
      const val = det.prefillArgs[input.name] ?? ""
      if (input.type.startsWith("uint")) return val || "0"
      if (input.type === "address") return val
      if (input.type === "bool") return val === "true"
      if (input.type.startsWith("tuple") || input.type.endsWith("]")) {
        try { return JSON.parse(val || "[]") } catch { return [] }
      }
      return val
    })

    const iface = new Interface(det.abiJson)
    const calldata = iface.encodeFunctionData(fn.name, fnArgs)
    expect(calldata.slice(0, 10)).toBe("0x4a21a2df")

    // Simulate the mint. eth_call runs the contract exactly like the real tx
    // would (verify(), price check, supply/limit checks) but never mines it.
    const provider = new JsonRpcProvider(`https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY_1}`)
    const result = await provider.call({
      to: det.callTarget,
      from: FUNDED_FROM,
      data: calldata,
      value: parseEther(det.value),
    })
    // A non-reverting eth_call proves the calldata + value would mint. mint()
    // has no return, so success is "0x".
    expect(result).toBe("0x")
  }, 30_000)
})
