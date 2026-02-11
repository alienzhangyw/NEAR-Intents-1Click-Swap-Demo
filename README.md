# NEAR Intents 1Click Swap Demo

Vite + TypeScript demo using `@defuse-protocol/one-click-sdk-typescript` to perform 1Click swaps with MetaMask.

Note: This demo currently supports MetaMask only and limits origin assets to EVM chains. Destination assets can be any supported chain.

## Requirements

- Node.js 18+
- Yarn (Corepack)

## Setup

```bash
yarn
```

## Development

```bash
yarn dev
```

## Build

```bash
yarn build
```

## Environment Variables

Create a `.env` file in the project root if needed:

```
VITE_ONECLICK_BASE_URL=https://1click.chaindefuser.com
VITE_ONECLICK_JWT=
VITE_SLIPPAGE_BPS=100
VITE_QUOTE_EXPIRY_MINUTES=30
VITE_POLL_INTERVAL_MS=10000
```

- `VITE_ONECLICK_JWT` is optional but recommended to reduce fees.
- `VITE_ONECLICK_BASE_URL` defaults to the public 1Click endpoint.

For GitHub Pages deployment, store `VITE_ONECLICK_JWT` in GitHub Secrets and it will be injected during the build step.

## GitHub Pages

This repo includes a GitHub Actions workflow that builds the app and deploys `dist` to GitHub Pages on push to the default branch.
