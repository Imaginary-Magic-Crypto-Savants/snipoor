# SAVANTSNIPOOR Privacy Policy

_Last updated: 2026-08-15_

SAVANTSNIPOOR is a browser extension for creating and managing crypto wallets and
minting NFTs on public blockchains (Ethereum, Base, Arbitrum, Robinhood Chain).
This policy describes what data the extension handles and where it goes.

## What stays on your device

- **Private keys and seed phrases never leave your device.** They are generated
  (or imported) locally, encrypted with AES-256-GCM using a key derived from
  your password (PBKDF2, 600,000 iterations), and stored only in your browser's
  local extension storage. Signing happens locally inside the extension's
  background process. We have no server that ever receives, stores, or can
  recover your keys. If you lose your password and seed phrase, your wallet
  cannot be recovered.
- Your password is never stored in plaintext and never transmitted anywhere.
- Wallet labels, settings, activity history, and cached balances are stored
  locally in extension storage.

## What leaves your device, and to whom

To function, the extension makes network requests that necessarily include some
data:

- **Public wallet addresses** are sent to blockchain RPC providers (Alchemy and
  public RPC endpoints such as LlamaNodes, Ankr, PublicNode, dRPC, MeowRPC,
  1RPC, and the official Base/Arbitrum endpoints) to read balances and to
  broadcast transactions you initiate. Wallet addresses are public information
  on the blockchain by design.
- **Contract addresses you enter** are sent to the Etherscan API to fetch
  contract ABIs, and to RPC providers to detect mint functions.
- **A price lookup** (no personal data) is made to CoinGecko for the ETH/USD
  rate.
- **License checks:** if access gating is enabled, the extension sends your
  access code and a random per-install device identifier to our license server
  (imcs.world) to verify your access. This identifier is not linked to your
  wallets or keys.
- Optional: if you enter your own API keys (Alchemy, Etherscan) in Settings,
  they are stored locally and used only to authenticate your requests to those
  services.

## What we do NOT do

- We do not collect analytics, telemetry, or usage statistics.
- We do not use cookies or tracking of any kind.
- We do not sell, share, or monetize any data.
- We do not have a backend that stores your wallet data.
- The extension does not read or interact with web pages you visit.

## Transaction data

Transactions you create are signed locally and broadcast to the public
blockchain via RPC providers. Blockchain transactions are permanently public by
nature of the technology.

## Changes

Material changes to this policy will be reflected in an updated version of this
document with a new date, shipped with the extension release notes.

## Contact

Questions about this policy: reach us via imcs.world.
