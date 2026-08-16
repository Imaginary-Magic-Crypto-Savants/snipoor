# Changelog

All notable changes to SAVANTSNIPOOR are documented here.

## [0.3.6-beta] - 2026-08-12

Full pre-store audit pass (RPC layer, UI flows, store policy) and fixes.

### Fixed
- **Free Alchemy keys no longer get poisoned by Robinhood.** The balance sweep
  offered free keys to Robinhood (4663), where they 401 — each failure globally
  throttled a free key, silently funneling ALL traffic onto the pay-as-you-go
  key (runaway billing) and burning two 12s timeouts per refresh. Balance key
  candidates are now chain-aware; pinned chains only see keys with the network
  enabled.
- **Balance retries now park the key that actually failed.** The old path
  attributed failures to the general RPC pool's pick — cooling endpoints the
  request never touched (on Robinhood, wrongly throttling the paid key).
- The paid key now respects its throttle cooldown in the balance path instead of
  being re-hit every attempt while rate-limited.
- **Mint execution worst case is bounded.** Inner RPC retries in the mint loop
  are capped at 2 (the outer loop already retries with error-specific fixes);
  previously a degraded network meant multi-minute silent hangs per wallet.
- SEND_ETH preflight now uses the hardened 12s-timeout provider — a dead RPC
  fails over in seconds instead of ethers' ~300s default.
- Balance refresh (GET_ALL_BALANCES) exempted from the 45s UI watchdog — large
  wallet sets could exceed it and show a spurious error while still completing.
- **Mint results survive popup close.** The final summary is persisted and shown
  as a banner on next open (MV3 closes popups freely mid-mint).
- Balances auto-refresh after send / disperse / consolidate / NFT consolidate —
  previously they showed stale cached numbers until a manual refresh.
- NFT consolidate no longer dead-ends after a run: back clears results, and a
  rescan/retry button replaces the vanished execute button.
- "Wallet created" success toast no longer fires when creation actually failed.
- Removed the dead gas estimate row (permanent "-") from the mint config screen.

### Added
- **Remove wallet.** Trash action on any sub-wallet or imported wallet (master
  can't be removed). Password-confirmed, with explicit warnings: shows remaining
  balance, and spells out that sub-wallets are only restorable by re-importing
  the seed while imported keys are gone for good without your own backup.
  Removed wallets are excluded from every flow (mint, fund, export, balances).

### Store readiness
- Privacy policy added (PRIVACY.md).
- Dropped unused host permissions (OpenSea, Basescan, Arbiscan APIs — never
  called) to reduce review friction.
- design-lab (dev playground) no longer ships in production builds.
- Added minimum_chrome_version 114 (sidePanel requirement); fixed toolbar icon
  size mapping; expanded the store description.
- Storage schema versioning + migration hook on extension update — future
  storage shape changes can't silently brick existing installs.

## [0.3.5-beta] - 2026-07-23

### Added
- **Access gating (license) scaffold.** The extension can now be locked behind an
  access code: a gate screen redeems a code from the Savant backend for a short-TTL
  JWT, with auto-refresh and a server-side kill switch. Off by default in dev
  (`LICENSE_ENABLED` unset); an admin/dev bypass code is supported for testing.
  Backend endpoints live in the Savant site (not shipped here yet).

### Fixed
- **Robinhood (4663) now uses your own Alchemy key.** The general RPC path for
  Robinhood was hardwired to a single rate-limited built-in key and ignored a
  user-supplied key entirely — detection would hang once that key was throttled. A
  user (or the paid) Alchemy key is now front-loaded into the Robinhood pool.
- **RPC calls no longer hang on dead/limited endpoints.** Every provider now has a
  12s request timeout and ethers' built-in 429 retry is disabled, so a rate-limited
  endpoint fails fast to our own failover instead of stalling the UI for minutes.
- **Loading states are actually visible.** Spinners on action buttons were washed
  out by the disabled-dim styling (and were low-contrast purple-on-purple) — every
  in-progress button now stays fully opaque with a visible spinner. Settings and
  Create-Wallet open instantly instead of dead-clicking through a round-trip; Save
  API key and Max (send) now show progress.

## [0.3.1-beta] - 2026-06-30

### Changed
- **Alchemy key fallback reworked.** Keys 1 and 2 (free tier) serve all traffic via
  round-robin. Key 3 (pay-as-you-go) is now a true last-resort overflow — used only
  when both free keys are rate-limited, and traffic returns to the free keys
  automatically once they recover. The paid key no longer bills during normal use.
- RPC endpoint selection is now health-ordered: a key that hits its limit is cooled
  for 60s and the next request rolls to the next free key, then the overflow key,
  then public nodes — recovering to the cheapest healthy endpoint as soon as it can.

### Fixed
- A revoked or invalid Alchemy key (401/403) now triggers automatic failover to the
  next key instead of failing the request.

## [0.3.0-beta] - 2026-06-25

### Added
- **Launchpad auto-detection (OpenSea SeaDrop).** Paste a collection address and the
  extension fingerprints it on-chain, then routes the mint through the correct
  SeaDrop contract automatically. No need to know that SeaDrop tokens mint through
  a router instead of the token itself.
- **Full detection cascade.** One button runs four tiers in order: launchpad
  fingerprint, verified ABI (Etherscan), proxy/bytecode resolution, then selector
  probing as a last resort.
- **Proxy resolution.** Resolves EIP-1167 minimal proxies (and push0/optimized
  clone variants), EIP-1967 / EIP-1822 / OpenZeppelin-legacy storage-slot proxies,
  and beacon proxies — so detection works on the real logic contract.
- **Live drop state + warnings.** Reads the SeaDrop public drop config and shows
  warnings before you mint: sale not live yet, sale ended, sold out, over the
  per-wallet cap. A platform badge ("OPENSEA SEADROP") confirms the detected route.

### Fixed
- **Wrong mint price on SeaDrop free/cheap mints.** Mint price is now read live from
  the drop config (`getPublicDrop`) instead of the token's own price functions
  (which SeaDrop tokens do not have). Sending the wrong `msg.value` was causing
  silent reverts.
- **Quantity not reflected in payment.** Changing quantity now rescales the total
  ETH value, fixing underpayment reverts when minting more than one.
- **Price precision.** Mint prices are computed with integer wei math end to end,
  eliminating floating-point / scientific-notation errors on very small prices.
- **Callback-only functions no longer auto-selected.** `mintSeaDrop` and privileged
  admin mints (ownerMint, devMint, etc.) are excluded — they always revert for a
  normal wallet.
- **Open editions.** Unlimited-supply drops no longer misreport supply, and
  open-ended sales (no end time) are correctly treated as active.

## [0.2.0-beta] - 2026-05-27

### Added
- Smart mint detection: auto-detects and ranks mint functions from verified contracts.
- Reads mint price directly from contract; auto-fills recipient/referral params.
- Unverified contract support via selector probing with an "UNVERIFIED - PROBED" badge.

## [0.1.0-beta] - 2026-05-26

- Initial beta: multi-wallet HD/imported wallets, disperse/consolidate, mint, NFT tools.
