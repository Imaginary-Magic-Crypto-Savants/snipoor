import type { ActivityEntry } from "~/lib/wallet/types"
import { storageGet, storageSet } from "./chrome-storage"

const LOG_KEY = "savantsnipor_activity"
const MAX_ENTRIES = 1000

export async function addActivity(entry: ActivityEntry): Promise<void> {
  const entries = (await storageGet<ActivityEntry[]>(LOG_KEY)) ?? []
  entries.unshift(entry)
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES
  await storageSet(LOG_KEY, entries)
}

export async function getActivity(limit?: number, offset = 0): Promise<ActivityEntry[]> {
  const entries = (await storageGet<ActivityEntry[]>(LOG_KEY)) ?? []
  if (!limit) return entries.slice(offset)
  return entries.slice(offset, offset + limit)
}

export async function clearActivity(): Promise<void> {
  await storageSet(LOG_KEY, [] as ActivityEntry[])
}
