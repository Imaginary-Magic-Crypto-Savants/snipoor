# SAVANTSNIPOOR

Multi-wallet Chrome extension for NFT and token sniping on EVM chains (Ethereum, Base, Arbitrum, Robinhood Chain).

[imcs.world](https://imcs.world) · [@imcsnft on X](https://x.com/imcsnft)

Source is public here so anyone can read exactly what this does before running it against
their wallet — see [Security Notes](#security-notes) below. This is not yet on the Chrome
Web Store (submitted, pending review); until it's approved, install it manually below.

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
git clone https://github.com/Imaginary-Magic-Crypto-Savants/savant-snipoor.git
cd savant-snipoor
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

### API Keys (Optional, official releases only)

Official release builds ship with built-in API keys for Alchemy, Etherscan, and OpenSea.
If you want to use your own keys for higher rate limits (or you built from source, see
above):

1. Open the extension and go to **Settings**
2. Enter your keys for any of: Alchemy, Etherscan, OpenSea
3. Your keys take priority over the built-in ones

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

**RPC errors:** The extension rotates through multiple RPC endpoints automatically. If you're hitting rate limits with many wallets, add your own Alchemy key in Settings.

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
