import { getAddress } from "ethers"
import { getProvider, withRetry } from "./provider"

// Storage slots for the common upgradeable-proxy standards.
const EIP1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
const EIP1967_BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50"
const EIP1822_PROXIABLE_SLOT = "0xc5f16f0fcc639fa48a6947836d9850f504798523bf8c9a3a87d5876cf622bcf7"
const OZ_LEGACY_IMPL_SLOT = "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3"

const ZERO = "0x0000000000000000000000000000000000000000"
// beacon.implementation()
const IMPLEMENTATION_SELECTOR = "0x5c60da1b"

function nonZeroAddressFromWord(word: string): string | null {
  // word is a 32-byte hex string; the address is the trailing 20 bytes.
  if (!word || word === "0x") return null
  const addr = "0x" + word.slice(-40)
  if (addr.toLowerCase() === ZERO) return null
  try {
    return getAddress(addr)
  } catch {
    return null
  }
}

/**
 * Extracts the 4-byte function selectors a contract dispatches on by scanning
 * its runtime bytecode for PUSH4 (0x63) opcodes. This is how we fingerprint an
 * unverified contract's interface without an ABI. Not perfectly precise (PUSH4
 * can appear in data), but the selector set is reliable enough to match against
 * known launchpad interfaces.
 */
export function extractSelectorsFromBytecode(code: string): Set<string> {
  const set = new Set<string>()
  const c = (code.startsWith("0x") ? code.slice(2) : code).toLowerCase()
  // Walk opcodes so PUSH operands aren't mistaken for opcodes. Solidity's
  // dispatcher loads each selector with PUSH4, so a real selector only ever
  // appears as PUSH4 data — counting other 0x63 bytes would yield false hits.
  for (let i = 0; i + 2 <= c.length; ) {
    const op = parseInt(c.slice(i, i + 2), 16)
    if (Number.isNaN(op)) break
    if (op >= 0x60 && op <= 0x7f) {
      const dataBytes = op - 0x5f // PUSH1 → 1 … PUSH32 → 32
      if (op === 0x63) {
        const sel = c.slice(i + 2, i + 10)
        if (sel.length === 8) set.add("0x" + sel)
      }
      i += 2 + dataBytes * 2
    } else {
      i += 2
    }
  }
  return set
}

/**
 * Resolves the implementation address behind a proxy. Handles EIP-1167 minimal
 * proxies (impl embedded in bytecode), EIP-1967 / EIP-1822 / OZ-legacy storage
 * slots, and EIP-1967 beacon proxies. Returns null if `address` is not a proxy.
 */
export async function resolveImplementation(chainId: number, address: string): Promise<string | null> {
  const provider = getProvider(chainId)
  const code = (await withRetry(chainId, () => provider.getCode(address))).toLowerCase()

  // EIP-1167 minimal proxy: 363d3d373d3d3d363d73<20-byte impl>5af43d82803e903d91602b57fd5bf3
  const minimal = code.match(/363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3/)
  if (minimal) {
    const impl = nonZeroAddressFromWord("0x" + minimal[1])
    if (impl) return impl
  }

  // Minimal-proxy variants (push0 clones, optimized clones, CWIA, etc) all embed
  // the implementation as PUSH20 (0x73<addr>) immediately before the DELEGATECALL
  // setup (5af43d…). Only trust this on proxy-sized bytecode to avoid matching a
  // PUSH20 address literal inside a full contract.
  if (code.length <= 2 + 200 * 2) {
    const clone = code.match(/73([0-9a-f]{40})5af43d/)
    if (clone) {
      const impl = nonZeroAddressFromWord("0x" + clone[1])
      if (impl) return impl
    }
  }

  // Storage-slot proxies (UUPS / transparent / OZ legacy).
  for (const slot of [EIP1967_IMPL_SLOT, EIP1822_PROXIABLE_SLOT, OZ_LEGACY_IMPL_SLOT]) {
    try {
      const word = await withRetry(chainId, () => provider.getStorage(address, slot))
      const impl = nonZeroAddressFromWord(word)
      if (impl) return impl
    } catch {}
  }

  // Beacon proxy: read the beacon address, then beacon.implementation().
  try {
    const word = await withRetry(chainId, () => provider.getStorage(address, EIP1967_BEACON_SLOT))
    const beacon = nonZeroAddressFromWord(word)
    if (beacon) {
      const res = await withRetry(chainId, () =>
        provider.call({ to: beacon, data: IMPLEMENTATION_SELECTOR })
      )
      const impl = nonZeroAddressFromWord(res)
      if (impl) return impl
    }
  } catch {}

  return null
}

/**
 * Returns the effective contract's dispatched selectors, transparently
 * resolving a proxy to its implementation first. `impl` is non-null when the
 * address turned out to be a proxy.
 */
export async function getContractSelectors(
  chainId: number,
  address: string
): Promise<{ selectors: Set<string>; impl: string | null }> {
  const provider = getProvider(chainId)
  const impl = await resolveImplementation(chainId, address).catch(() => null)
  const target = impl ?? address
  const code = await withRetry(chainId, () => provider.getCode(target))
  return { selectors: extractSelectorsFromBytecode(code), impl }
}
