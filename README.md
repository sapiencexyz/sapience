# 👽 Foil

Foil is a fully decentralized marketplace connecting producers of onchain computing resources with consumers.

See the [website](https://foil.xyz), [app](https://app.foil.xyz), and [docs](https://docs.foil.xyz).

## Develop

- Start the protocol on a local node
  - `pnpm run dev:protocol` and press `i` to interact with it
- Start the app
  - `pnpm run dev:app` and access at http://localhost:3000
  - Connect your wallet application to http://localhost:8545 (Chain ID 13370) **Remember to reset the nonce in the wallet after restarting the node.**
- Start the API
  - `pnpm run dev:api` and access at http://localhost:3001
- Start the website
  - `pnpm run dev:foil` and access at http://localhost:3002
- Start the docs
  - `pnpm run dev:docs` and access at http://localhost:3003