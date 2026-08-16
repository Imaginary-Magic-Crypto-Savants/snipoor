export interface PlatformPreset {
  id: string
  label: string
  callTarget?: Record<number, string>
  abiJson: string
  defaults?: Record<string, string>
}

const SEADROP = "0x00005EA00Ac477B1030CE78506496e8C2dE24bf5"
const OS_FEE = "0x0000a26b00c1F0DF003000390027140000fAa719"
const ZERO = "0x0000000000000000000000000000000000000000"

export const PLATFORM_PRESETS: PlatformPreset[] = [
  {
    id: "opensea",
    label: "OPENSEA",
    callTarget: { 1: SEADROP, 8453: SEADROP, 42161: SEADROP },
    abiJson: JSON.stringify([
      {
        type: "function",
        name: "mintPublic",
        stateMutability: "payable",
        inputs: [
          { name: "nftContract", type: "address" },
          { name: "feeRecipient", type: "address" },
          { name: "minterIfNotPayer", type: "address" },
          { name: "quantity", type: "uint256" },
        ],
        outputs: [],
      },
    ]),
    defaults: {
      nftContract: "{{CONTRACT}}",
      feeRecipient: OS_FEE,
      minterIfNotPayer: ZERO,
    },
  },
  {
    id: "zora",
    label: "ZORA",
    abiJson: JSON.stringify([
      {
        type: "function",
        name: "purchase",
        stateMutability: "payable",
        inputs: [{ name: "quantity", type: "uint256" }],
        outputs: [{ name: "", type: "uint256" }],
      },
      {
        type: "function",
        name: "mintWithRewards",
        stateMutability: "payable",
        inputs: [
          { name: "recipient", type: "address" },
          { name: "quantity", type: "uint256" },
          { name: "comment", type: "string" },
          { name: "mintReferral", type: "address" },
        ],
        outputs: [{ name: "", type: "uint256" }],
      },
    ]),
    defaults: {
      comment: "",
      mintReferral: ZERO,
    },
  },
]

export function getPreset(id: string): PlatformPreset | undefined {
  return PLATFORM_PRESETS.find((p) => p.id === id)
}

export function resolveDefaults(preset: PlatformPreset, contractAddress: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!preset.defaults) return out
  for (const [key, val] of Object.entries(preset.defaults)) {
    out[key] = val.replace("{{CONTRACT}}", contractAddress)
  }
  return out
}
