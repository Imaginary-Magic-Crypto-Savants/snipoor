// Live check of the Scatter API resolver end to end. Opt-in (LIVE_RPC=1) since
// it hits api.scatter.art. Uses toxik-kidz (public root=0x0 + a WL phase).
//   LIVE_RPC=1 npx vitest run tests/lib/mint/scatter.live.test.ts
import { describe, it, expect } from "vitest"
import { fetchEligibleLists, fetchAggregatedEligibility, resolveListMint } from "~/lib/mint/scatter"

const LIVE = process.env.LIVE_RPC === "1"
const d = LIVE ? describe : describe.skip

const CHAIN = 1
const NFT = "0xEB8eaC6b992edF0D4c32ecb9c61fc74E3c136F88" // toxik-kidz
const SLUG = "toxik-kidz"
const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"

d("Scatter API resolver (live)", () => {
  it("fetches the public list and flags it public", async () => {
    const lists = await fetchEligibleLists(SLUG, NFT)
    const pub = lists.find((l) => l.name.toLowerCase().includes("public"))
    expect(pub).toBeTruthy()
    expect(pub!.isPublic).toBe(true)
    expect(pub!.isEth).toBe(true)
    expect(parseFloat(pub!.priceEth)).toBeGreaterThan(0)
  }, 30_000)

  it("aggregates eligibility across wallets", async () => {
    const agg = await fetchAggregatedEligibility(SLUG, NFT, [VITALIK])
    expect(agg.length).toBeGreaterThan(0)
    // The public list should include the wallet.
    const pub = agg.find((e) => e.list.isPublic)
    expect(pub?.eligibleWallets).toContain(VITALIK)
  }, 30_000)

  it("resolves + validates public-list mint calldata into re-encodable args", async () => {
    const lists = await fetchEligibleLists(SLUG, NFT, VITALIK)
    const pub = lists.find((l) => l.isPublic && l.isEth)!
    const { resolved, skipped } = await resolveListMint(CHAIN, NFT, pub, 1, [VITALIK])
    // Public list: calldata must pass every validation and produce args.
    expect(skipped.length).toBe(0)
    expect(resolved.length).toBe(1)
    const [auth, qty, affiliate, sig] = resolved[0].args as [[string, string[]], string, string, string]
    expect(auth[0].toLowerCase()).toBe(pub.root.toLowerCase()) // key == list root
    expect(Array.isArray(auth[1])).toBe(true) // proof array (empty for public)
    expect(qty).toBe("1")
    expect(affiliate).toBe("0x0000000000000000000000000000000000000000")
    expect(sig).toBe("0x")
    expect(resolved[0].valueWei > 0n).toBe(true)
  }, 30_000)
})
