# SAVANTSNIPOOR - Full Codebase Review & Optimization Plan

## Context

Round-trip testing revealed rate-limiting, gas calculation, and UX issues across the multi-wallet Chrome extension. This plan addresses every finding from a full codebase audit: transaction bugs, state management gaps, UI polish, RPC optimization, and security hardening. Goal: reliable, snappy wallet extension that handles 1-100 wallets without choking RPCs or losing state.

---

## Phase 1: Critical Bugs (must fix first)

### 1A. Gas cost formula - WRONG everywhere
**Files:** `src/lib/tx/engine.ts:149`, `src/background/index.ts:676,737`

Current: `gasCost = gasLimit * (maxFeePerGas + maxPriorityFeePerGas)`
Correct: `gasCost = gasLimit * maxFeePerGas`

`maxPriorityFeePerGas` is a tip *within* `maxFeePerGas`, not additive. Current formula double-counts, overstating gas cost by ~30-100%. Result: consolidation skips wallets that actually have enough ETH, and `ESTIMATE_MAX_SEND` undershoots sendable amount.

**Fix:** Replace all three occurrences. Use `gasLimit * maxFeePerGas` only.

### 1B. `pollTxReceipts` marks timed-out txs as "confirmed"
**File:** `src/lib/tx/engine.ts:236-238`

```ts
for (const r of withHash) {
  if (r.status === "pending") r.status = "confirmed"  // BUG
}
```

After 40 polls (~2min), any still-pending tx is silently flipped to "confirmed". This is data corruption - tx could still be pending or could fail later.

**Fix:** Mark as `"timeout"` instead. Add `"timeout"` to the TxResult status union. Activity log should show TIMEOUT, not CONFIRMED.

### 1C. `mintWallet` returns "confirmed" before tx mines
**File:** `src/lib/mint/executor.ts:53-57`

```ts
return { address: wk.address, hash: tx.hash, status: "confirmed" }
```

Should be `"pending"`. The `pollReceipts` function then filters on `status === "confirmed"` to find what to poll, which is semantically inverted. Fix: return `"pending"`, poll filter stays on `"pending"`.

### 1D. `host_permissions` missing ~12 fallback RPCs
**File:** `manifest.json`

Only 5 domains listed. The RPC fallback pools in `chains.ts` include `ankr.com`, `publicnode.com`, `1rpc.io`, `drpc.org`, `meowrpc.com` - all silently blocked by Chrome. This means RPC rotation mostly doesn't work in production.

**Fix:** Add all fallback domains to `host_permissions`.

### 1E. `EXPORT_ALL_KEYS` has no password verification
**File:** `src/background/index.ts:450-465`

`EXPORT_KEY` and `EXPORT_MNEMONIC` both re-verify password. `EXPORT_ALL_KEYS` reads directly from vault memory with zero auth. Any code that can send a Chrome message while unlocked gets every private key.

**Fix:** Require `msg.payload.password`, decrypt+verify against keystore before returning keys.

---

## Phase 2: Transaction Engine Overhaul

### 2A. Unified rate-limited RPC request queue
**New file:** `src/lib/chain/rpc-queue.ts`

Core problem: no throttling. 10 concurrent `Promise.all` calls hit the same RPC simultaneously. Public RPCs 429 under load.

**Design:** In-house, zero dependencies (~60 lines). No npm packages for this - wallet extension should minimize attack surface.
- Token-bucket rate limiter: max N concurrent requests per chain (configurable, default 5)
- Queue overflow waits, doesn't drop
- All RPC calls route through this queue
- `withRetry` wraps queue calls, not raw provider calls
- Adaptive: if 429 detected, reduce concurrency for that chain temporarily

### 2B. Adaptive batch sizing
**Files:** `src/lib/tx/engine.ts`, `src/lib/mint/executor.ts`

Current: hardcoded batch of 10, no inter-batch delay (except mint which has 400ms).

**Design:**
- Default batch size 5 for public RPCs, 10 for Alchemy
- 500ms inter-batch delay for disperse/consolidate (matching mint pattern)
- Scale batch size based on wallet count: 1-10 wallets = batch all, 11-50 = batch 5, 51-100 = batch 3
- Progress callback from engine functions so UI can show real-time progress

### 2C. Nonce hole recovery for `fundSubWallets`
**File:** `src/lib/tx/engine.ts:61-126`

If tx at nonce N fails, all nonces N+1..M are orphaned. No recovery.

**Fix:** Track which nonces succeed. If a batch has failures, stop sending further batches from same sender. Return partial results with clear status on what succeeded vs failed vs not-attempted.

### 2D. NFT consolidation improvements
**File:** `src/lib/consolidate/nft.ts`

Current: fully sequential, no retry, no batching. Each `tx.wait()` blocks before next send.

**Fix:**
- Add `withRetry` wrapping on nonce fetch and send
- Pipeline within each wallet: send tx, don't wait for receipt. Increment nonce locally. Batch-poll receipts after all sends.
- Process wallets in parallel batches of 3-5 (each wallet is independent sender)
- Add 20% gas buffer on the auto-estimated gas

### 2E. Consolidate `SEND_ETH` into the tx engine
**File:** `src/background/index.ts:634-716`

Currently duplicates all RPC/gas logic inline. Should use `sendTransaction()` from `engine.ts` which already handles this.

**Fix:** Refactor to use existing `sendTransaction`. Keep the auto-adjust-value-for-gas logic. Fix activity type from `"fund"` to `"send"`.

### 2F. Fix consolidateETH to leave wallets at exactly 0
**File:** `src/lib/tx/engine.ts:128-200`

After fixing gas formula (1A), also add a tighter estimation: fetch actual gas estimate for the specific send (not hardcoded 21000n for contract interactions). For pure ETH sends, 21000n is correct but add a small buffer (21050n) for safety.

---

## Phase 3: State Management

### 3A. Cache balances to `chrome.storage.local`
**Files:** `src/background/index.ts`, `src/hooks/useWallet.ts`

Current: balances only in React state. Every popup open = $0.00 until manual refresh.

**Design:**
- After `GET_ALL_BALANCES` succeeds, persist result to `chrome.storage.local` under `savantsnipor_balances` with timestamp
- On `GET_WALLETS` response, also return cached balances if available
- `useWallet` hook merges cached balances into initial wallet state
- Show "last updated X min ago" indicator
- Auto-fetch balances on unlock (with rate limit: max once per 30 seconds)

### 3B. Rate limit balance fetches
**File:** `src/background/index.ts` (GET_ALL_BALANCES handler)

**Design:**
- Track `lastBalanceFetch` timestamp in service worker memory
- Reject GET_ALL_BALANCES if called within 15 seconds of last fetch
- Return cached data with `fromCache: true` flag so UI knows
- For 50+ wallets, multicall already batches efficiently (80 calls per batch), but add 500ms between chain fetches instead of `Promise.allSettled` across all 3 chains simultaneously

### 3C. Push updates from service worker to popup
**Files:** `src/background/index.ts`, `src/popup.tsx`

Currently no reverse channel. Service worker never pushes to popup.

NOT for balance updates (no real-time balance notifications needed). FOR: tx progress during batch ops, activity log updates, tx status changes.

**Design:**
- Use `chrome.runtime.sendMessage` from service worker to popup (fire-and-forget, popup may not be open)
- Events: `TX_PROGRESS` (batch progress), `TX_STATUS_CHANGED`, `ACTIVITY_ADDED`
- Popup registers listener in `useEffect` to update React state on these events
- StatsBar updates after batch operations complete
- Progress events: `{ type: "TX_PROGRESS", current: 12, total: 50, label: "Dispersing..." }`

### 3D. Fix activity type labels + block explorer links
**Files:** `src/components/panels/ActivityPanel.tsx`, `src/background/index.ts`, `src/lib/chain/chains.ts`

- Disperse operations log as `"fund"` - rename to `"disperse"`
- `SEND_ETH` should log as `"send"` not `"fund"`
- ActivityPanel: add display label mapping (`disperse` -> "DISPERSE", `send` -> "SEND", etc.)
- Add auto-refresh: re-fetch activity when popup receives `ACTIVITY_ADDED` push event

**Block explorer links on every tx:**
- `chains.ts` already has `explorerUrl` per chain (etherscan.io, basescan.org, arbiscan.io)
- ActivityPanel: each entry with a `txHash` gets a clickable link: `${explorerUrl}/tx/${txHash}`
- Open in new tab via `chrome.tabs.create({ url })`
- Show hash as shortened link (e.g. `0xab12...ef34`)

### 3E. SEND_ETH success response with explorer link
**File:** `src/background/index.ts` (SEND_ETH handler)

After successful send, response should include:
- `hash`: full tx hash
- `status`: confirmed/failed
- `explorerUrl`: full link to `${chain.explorerUrl}/tx/${hash}`

UI (WalletsPanel send flow) should display:
- Success message with shortened hash
- Clickable link to block explorer
- Copy-hash button

---

## Phase 4: UI/UX

### 4A. Lock screen gap fix
**Files:** `src/components/screens/UnlockScreen.tsx`, `src/styles/layout.css`, `src/styles/components.css`

Root cause: `.screen-overlay` has `gap: 18px`. The `.error-msg` div always renders with `min-height: 14px` even when empty. Total gap = 32px between input and button.

**Fix:**
- Only render `.error-msg` div when `error` is truthy
- OR: set `.error-msg:empty { display: none; min-height: 0; }` in CSS
- Tighten gap to 14px on `.screen-overlay`

### 4B. Progress indicators for batch operations
**Files:** `src/components/panels/WalletsPanel.tsx`, `src/components/panels/MintPanel.tsx`

Need real-time progress for: disperse, consolidate, NFT consolidate, batch mint.

**Design:**
- Add `progress` state: `{ current: number; total: number; label: string } | null`
- Service worker sends progress updates via push events (from 3C)
- Engine functions accept optional `onProgress` callback
- Display: progress bar with "12/50 wallets funded" or "24/100 mints sent (24%)"
- Spinner + percentage shown on the action button while running

### 4C. Missing loading states
**File:** `src/components/panels/WalletsPanel.tsx`

Add `disabled` + spinner to:
- Export All Keys button (line ~658)
- Export Seed Phrase / Reveal button (line ~872)
- Export single key button (line ~703)

### 4D. Button styling during operations
Ensure all action buttons:
- Show spinner (not just gray out)
- Are `disabled` during operation
- Show status text ("Sending..." / "Confirming...")

---

## Phase 5: RPC & Network Optimization

### 5A. Multiple Alchemy keys (3 total)
**Files:** `src/lib/chain/provider.ts`, `src/lib/api/keys.ts`, `webpack.config.js`, `.env`

3 Alchemy keys total. Ship as internal keys (baked into build). User-supplied key takes priority over all internal keys.

**Design:**
- `.env`: `ALCHEMY_API_KEY_1`, `ALCHEMY_API_KEY_2`, `ALCHEMY_API_KEY_3`
- `keys.ts`: `getApiKey("alchemy")` checks user key first (`chrome.storage.local`), then round-robins across internal keys
- Each Alchemy key = separate URL in the RPC pool, prepended before public RPCs
- Result: 3x Alchemy rate limit budget before hitting public RPCs
- User key (if set) always goes first in pool

### 5B. Multiple Etherscan keys (2 total)
**Files:** `src/lib/api/keys.ts`, `webpack.config.js`, `.env`

2 Etherscan keys. Same pattern: internal keys ship baked in, user key takes priority.
- `.env`: `ETHERSCAN_API_KEY_1`, `ETHERSCAN_API_KEY_2`
- Round-robin across internal keys. User key first if set.

### 5C. Dual OpenSea keys (2 total)
**Files:** `src/lib/api/keys.ts`, `webpack.config.js`, `.env`, `src/lib/nft/balance.ts`

2 OpenSea keys. Same priority pattern.
- `.env`: `OPENSEA_KEY_1`, `OPENSEA_KEY_2`
- Round-robin for NFT operations. User key first if set.

### 5X. User API key priority model
**All key types follow this pattern:**
1. Check `chrome.storage.local` for user-supplied key -> use if found
2. Else round-robin across internal (baked-in) keys
3. Internal keys are fallback only when user hasn't set their own

### 5D. Fix `host_permissions` comprehensively
**File:** `manifest.json`

Add all RPC domains used in `chains.ts`:
```json
"https://rpc.ankr.com/*",
"https://*.publicnode.com/*",
"https://1rpc.io/*",
"https://*.drpc.org/*",
"https://*.meowrpc.com/*",
"https://api.opensea.io/*",
"https://api.etherscan.io/*",
"https://api.basescan.org/*",
"https://api.arbiscan.io/*"
```

### 5E. RPC health tracking
**File:** `src/lib/chain/provider.ts`

Track latency and error rate per RPC. Prefer fastest healthy RPCs. Deprioritize RPCs that recently 429'd (cooldown period). Already have `testRpc()` - extend to periodic health checks.

---

## Phase 6: Security Hardening

### 6A. Message sender validation
**File:** `src/background/index.ts:768`

Currently `_sender` is ignored. Any content script could send messages.

**Fix:** Validate `sender.id === chrome.runtime.id` at the top of the listener. Reject external senders.

### 6B. Private key import input
**File:** `src/components/panels/WalletsPanel.tsx:727`

Change `type="text"` to `type="password"` on the private key import field.

### 6C. Add Content Security Policy
**File:** `manifest.json`

Add explicit CSP:
```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'none'"
}
```

### 6D. Brute-force throttle on unlock
**File:** `src/background/index.ts`

Add attempt counter. After 5 failed attempts, enforce 30-second cooldown. After 10, enforce 5-minute cooldown. Reset on successful unlock.

### 6E. `toBase64` stack overflow risk
**File:** `src/lib/wallet/encryption.ts:9`

Replace spread operator with chunked encoding for large buffers:
```ts
function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ""
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}
```

### 6F. Wallet count cap
**File:** `src/background/index.ts` (CREATE_WALLET, ADD_SUBWALLETS handlers)

Enforce max 100 wallets total (masters + subs + imported). Reject creation beyond limit.

---

## Phase 7: Quality of Life

### 7A. IP rotation consideration
NOT recommended for a Chrome extension. Reasons:
- Extension runs in user's browser - can't rotate IPs without a proxy service
- Proxy services add latency to every RPC call (bad for sniping)
- Multiple Alchemy keys + public RPC pool rotation achieves the same rate-limit defense
- If needed later, could add SOCKS5 proxy support as optional advanced setting

### 7B. Rabby-style patterns to adopt
After reviewing Rabby's approach (open source):
- **Provider pool with health scoring** - we're adding this (5E)
- **Cached balances with stale-while-revalidate** - we're adding this (3A)
- **Optimistic UI with background confirmation** - partially doing this already
- **Single tx path** - consolidating SEND_ETH into engine (2E)

---

## Implementation Order

1. **Phase 1** - Critical bugs (gas formula, poll timeout, mint status, host_permissions, EXPORT_ALL_KEYS auth) - ~2 hours
2. **Phase 6** - Security (sender validation, PK input, CSP, brute-force, base64, wallet cap) - ~1 hour  
3. **Phase 3** - State management (balance cache, rate limit, push updates, activity labels) - ~3 hours
4. **Phase 2** - Transaction engine (RPC queue, adaptive batching, nonce recovery, NFT improvements, SEND_ETH consolidation) - ~4 hours
5. **Phase 4** - UI/UX (lock screen, progress indicators, loading states) - ~2 hours
6. **Phase 5** - RPC optimization (multi-key support, host_permissions, health tracking) - ~2 hours

---

## Verification

After each phase:
- `npm run build` - clean compile
- Load unpacked extension in Chrome
- Test: create wallet -> fund sub-wallets -> check balances -> consolidate back -> send ETH external
- Verify activity log shows correct types
- Verify lock screen layout
- Verify progress indicators during batch operations
- Test with 10+ wallets for rate limit behavior
- Check Chrome DevTools network tab for blocked requests (host_permissions fix)
- Attempt EXPORT_ALL_KEYS without password (should fail after fix)
- Test unlock brute-force throttle (5+ wrong passwords)

---

## Files Modified (by phase)

**Phase 1:** `engine.ts`, `background/index.ts`, `executor.ts`, `manifest.json`, `types.ts`
**Phase 2:** `engine.ts`, `executor.ts`, `nft.ts`, `background/index.ts`, NEW `rpc-queue.ts`
**Phase 3:** `background/index.ts`, `useWallet.ts`, `popup.tsx`, `ActivityPanel.tsx`, `StatsBar.tsx`, `chains.ts`, `WalletsPanel.tsx`
**Phase 4:** `UnlockScreen.tsx`, `layout.css`, `components.css`, `WalletsPanel.tsx`, `MintPanel.tsx`
**Phase 5:** `provider.ts`, `keys.ts`, `chains.ts`, `manifest.json`, `balance.ts`
**Phase 6:** `background/index.ts`, `WalletsPanel.tsx`, `manifest.json`, `encryption.ts`
