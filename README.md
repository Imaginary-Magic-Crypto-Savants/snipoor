# SAVANTSNIPOOR

Multi-wallet Chrome extension for NFT and token sniping on EVM chains (Ethereum, Base, Arbitrum, Robinhood Chain).

[imcs.world](https://imcs.world) · [@imcsnft on X](https://x.com/imcsnft)

Source is public here so anyone can read exactly what this does before running it against
their wallet — see [Security Notes](#security-notes) below. This is not yet on the Chrome
Web Store (submitted, pending review); until it's approved, install it manually below.

**For best performance, add your own free Alchemy key in Settings after install.** The
built-in RPC keys are shared across every user running the official build, so they get
rate-limited faster the more people are sniping at once — especially with many wallets.
Your own key (free tier is plenty) is a couple minutes at [alchemy.com](https://alchemy.com)
and keeps your requests off the shared pool.

## Install

### Option A — download the release (fastest, no build required)

1. Grab the latest zip from [Releases](../../releases).
2. Unzip it.
3. Open Chrome, go to `chrome://extensions`, enable **Developer mode** (top right).
4. Click **Load unpacked**, select the unzipped folder.
5. The SAVANTSNIPOOR icon appears in your toolbar — pin it for easy access.

### Option B — build from source (for verifying the code yourself)

Requirements: Google Chrome (or any Chromium browser), Node.js 18+, npm.

```bash
git clone https://github.com/Imaginary-Magic-Crypto-Savants/snipoor.git
cd snipoor
npm install
npm run build
```

This creates a `dist/` folder with the built extension. Then load it the same way as
Option A (steps 3-5 above), selecting `dist/` instead of the unzipped release folder.

Note: the official release ships with built-in RPC/API keys (Alchemy, Etherscan, OpenSea)
baked in at build time. Those keys are not in this public repo (kept in a gitignored
`.env`), so a from-source build has none by default — add your own free-tier keys in
Settings after first launch, or copy `.env.example` to `.env` before building.

### First Launch

1. Click the extension icon to open the popup
2. Create a password - this encrypts all wallet data locally
3. Choose how many sub-wallets to generate (1, 10, 25, 50, or 100)
4. You're in - fund your wallets and start sniping

### API Keys — we recommend adding your own Alchemy key

Official release builds ship with a built-in Alchemy key, but it's shared across every
user running this extension. The more people sniping at once, the sooner it gets
rate-limited — which shows up as stalled balances, slow mint detection, or a transaction
that doesn't fire right when you need it to. **Getting your own free Alchemy key takes
about 2 minutes and removes the single biggest source of flaky behavior.** We recommend
doing this before you use the extension seriously, not after something goes wrong.

1. Create a free account at [alchemy.com](https://alchemy.com), grab an API key
2. Open the extension → **Settings**
3. Paste it into the Alchemy field — it takes priority over the built-in one immediately

Etherscan and OpenSea keys are optional extras (only used for contract ABI lookups);
Alchemy is the one that actually matters for performance.

### Access & Wallet Limits

Access requires holding **5 Savants on Robinhood Chain** — live now. No IQ or trait
requirement, holding alone qualifies. Connect your wallet at
[imcs.world](https://www.imcs.world/sitee/snipor) to self-issue a code. Already hold
on Ethereum mainnet ([collection on
OpenSea](https://opensea.io/collection/imaginary-magic-crypto-savants))? Bridge to
Robinhood first at [imcs.world/sitee/robinhud](https://www.imcs.world/sitee/robinhud) —
the bridge is open, migration is one-way (burn on ETH, claim the same token on
Robinhood, same ID/traits/IQ).

Manually-issued beta codes still work too (unlimited wallets, not tied to holdings) —
those predate the self-serve flow and aren't being phased out on any set date.

How many wallets you can mint from at once scales with how many Savants you hold:

```
holds < 5   -> 0 (no access)
holds >= 5  -> min(1 + (holds - 5), 100)
```

5 Savants = 1 wallet, 6 = 2, 45 = 41, capped at 100 wallets regardless of holdings above
that. This cap only applies to **minting** — creating wallets, dispersing funds, and
consolidating are never limited. A 24h background check re-verifies holdings and adjusts
your limit (up or down) automatically; the extension itself checks for updates roughly
once every 24 hours (whenever its session token refreshes), so a holdings change can take
up to a day to show up — there's no manual "refresh now" button yet.

### Updating

**Release install:** grab the newest zip from [Releases](../../releases), unzip over the
old folder, then go to `chrome://extensions` and click the refresh icon on the
SAVANTSNIPOOR card.

**From-source install:**

```bash
git pull
npm install
npm run build
```

Then refresh the extension the same way.

### Supported Chains

- Ethereum Mainnet
- Base
- Arbitrum
- Robinhood Chain

### Troubleshooting

**Extension not loading:** Make sure you selected the `dist/` folder (or the unzipped release folder), not the project root.

**RPC errors:** The extension rotates through multiple RPC endpoints automatically, but if you're hitting rate limits with many wallets, this is the fix — see [API Keys](#api-keys--we-recommend-adding-your-own-alchemy-key) above.

**Forgot password:** There is no recovery. Wallet data is encrypted locally. If you lose your password, you'll need to re-import your wallets using seed phrases or private keys.

## Security Notes

- All private keys are encrypted with AES-256-GCM (PBKDF2, 600k iterations)
- Keys never leave your browser - no external servers
- The extension auto-locks when you close all Chrome windows
- Back up your seed phrases separately - the extension is not a backup
- Full data-handling breakdown: [PRIVACY.md](PRIVACY.md)

## License

Source is provided here for transparency and audit — so you can verify what this does
before trusting it with a wallet. All rights reserved; no license is granted to copy,
redistribute, or reuse this code without permission.
