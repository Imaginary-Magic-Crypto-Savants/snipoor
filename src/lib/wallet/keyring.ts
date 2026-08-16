import { HDNodeWallet, Mnemonic, Wallet } from "ethers"
import type { DerivedWallet } from "./types"

const HD_PATH_PREFIX = "m/44'/60'/0'/0/"

export function generateMnemonic(): string {
  return HDNodeWallet.createRandom().mnemonic!.phrase
}

export function deriveWallets(mnemonic: string, count: number): DerivedWallet[] {
  const mnemonicObj = Mnemonic.fromPhrase(mnemonic)
  const wallets: DerivedWallet[] = []
  for (let i = 0; i < count; i++) {
    const path = HD_PATH_PREFIX + i
    const hd = HDNodeWallet.fromMnemonic(mnemonicObj, path)
    wallets.push({ index: i, address: hd.address, path, privateKey: hd.privateKey })
  }
  return wallets
}

export function importPrivateKey(hexKey: string): { address: string; privateKey: string } {
  const normalized = hexKey.startsWith("0x") ? hexKey : "0x" + hexKey
  const w = new Wallet(normalized)
  return { address: w.address, privateKey: w.privateKey }
}

export function validateMnemonic(phrase: string): boolean {
  try {
    Mnemonic.fromPhrase(phrase)
    return true
  } catch {
    return false
  }
}

export function validatePrivateKey(key: string): boolean {
  try {
    const normalized = key.startsWith("0x") ? key : "0x" + key
    new Wallet(normalized)
    return true
  } catch {
    return false
  }
}
