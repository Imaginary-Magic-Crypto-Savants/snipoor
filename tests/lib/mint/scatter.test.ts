import { describe, it, expect } from "vitest"
import { slugFromInput } from "~/lib/mint/scatter"

describe("slugFromInput", () => {
  it("accepts a bare slug", () => {
    expect(slugFromInput("toxik-kidz")).toBe("toxik-kidz")
  })
  it("extracts the slug from scatter.art URLs", () => {
    expect(slugFromInput("scatter.art/toxik-kidz")).toBe("toxik-kidz")
    expect(slugFromInput("https://www.scatter.art/toxik-kidz")).toBe("toxik-kidz")
    expect(slugFromInput("https://scatter.art/toxik-kidz?ref=1#mint")).toBe("toxik-kidz")
    expect(slugFromInput("  scatter.art/Cool_Drop-2 ")).toBe("Cool_Drop-2")
  })
  it("rejects empty, multi-segment, and address inputs", () => {
    expect(slugFromInput("")).toBeNull()
    expect(slugFromInput("   ")).toBeNull()
    expect(slugFromInput("foo/bar")).toBeNull()
    expect(slugFromInput("0xEB8eaC6b992edF0D4c32ecb9c61fc74E3c136F88")).toBeNull()
  })
})
