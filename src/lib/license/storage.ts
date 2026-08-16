import { storageGet, storageSet, storageRemove } from "~/lib/storage/chrome-storage"
import type { LicenseState } from "./types"

const LICENSE_KEY = "savantsnipor_license"
const DEVICE_ID_KEY = "savantsnipor_device_id"

export async function loadLicense(): Promise<LicenseState | undefined> {
  return storageGet<LicenseState>(LICENSE_KEY)
}

export async function saveLicense(state: LicenseState): Promise<void> {
  await storageSet(LICENSE_KEY, state)
}

export async function clearLicense(): Promise<void> {
  await storageRemove(LICENSE_KEY)
}

// Stable per-install identifier so the backend can bind / cap devices per code.
// Generated once and persisted. Not security-sensitive on its own.
export async function getDeviceId(): Promise<string> {
  const existing = await storageGet<string>(DEVICE_ID_KEY)
  if (existing) return existing
  const id = crypto.randomUUID()
  await storageSet(DEVICE_ID_KEY, id)
  return id
}
