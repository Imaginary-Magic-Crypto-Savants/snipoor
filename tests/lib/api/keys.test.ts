import { getApiKey, getAllAlchemyKeys, setUserApiKey } from "~/lib/api/keys"

describe("api keys", () => {
  const store: Record<string, unknown> = {}
  let originalAlchemyKey: string | undefined

  beforeEach(() => {
    originalAlchemyKey = process.env.ALCHEMY_API_KEY_1
    for (const key of Object.keys(store)) delete store[key]
    ;(globalThis as unknown as { chrome: unknown }).chrome = {
      storage: {
        local: {
          get: async (key: string) => ({ [key]: store[key] }),
          set: async (value: Record<string, unknown>) => { Object.assign(store, value) },
        },
      },
    }
  })

  afterEach(() => {
    delete (globalThis as unknown as { chrome?: unknown }).chrome
    if (originalAlchemyKey === undefined) delete process.env.ALCHEMY_API_KEY_1
    else process.env.ALCHEMY_API_KEY_1 = originalAlchemyKey
  })

  it("does not fall back to bundled environment keys", async () => {
    process.env.ALCHEMY_API_KEY_1 = "do-not-bundle"
    await expect(getApiKey("alchemy")).resolves.toBeNull()
    await expect(getAllAlchemyKeys()).resolves.toEqual([])
  })

  it("stores trimmed user keys and removes blank keys", async () => {
    await setUserApiKey("alchemy", "  user-key  ")
    await expect(getApiKey("alchemy")).resolves.toBe("user-key")
    await expect(getAllAlchemyKeys()).resolves.toEqual(["user-key"])

    await setUserApiKey("alchemy", "   ")
    await expect(getApiKey("alchemy")).resolves.toBeNull()
  })
})
