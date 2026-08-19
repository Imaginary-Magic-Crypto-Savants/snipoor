import type { EncryptedKeystore } from "~/lib/wallet/types"
import { storageGet, storageSet, storageRemove } from "./chrome-storage"

const KEYSTORE_KEY = "savantsnipor_keystore"

export async function saveKeystore(keystore: EncryptedKeystore): Promise<void> {
  await storageSet(KEYSTORE_KEY, keystore)
}

export async function loadKeystore(): Promise<EncryptedKeystore | null> {
  return (await storageGet<EncryptedKeystore>(KEYSTORE_KEY)) ?? null
}

export async function deleteKeystore(): Promise<void> {
  await storageRemove(KEYSTORE_KEY)
}

export async function keystoreExists(): Promise<boolean> {
  const ks = await loadKeystore()
  return ks !== null
}
