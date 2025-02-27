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
  - `pnpm run dev:website` and access at http://localhost:3002
- Start the docs
  - `pnpm run dev:docs` and access at http://localhost:3003

## Deploy

- Go to `/packages/protocol` in your terminal.
- Bump the version in `/packages/protocol/package.json` if appropriate.
- Verify there are no issues with `pnpm simulate-deploy:sepolia --rpc-url <rpc-url> --private-key <private-key>`

🔐 _You can deploy with a hardware wallet by running [Frame](https://frame.sh) and omitting the `--private-key` option._

Then:
```
pnpm deploy:sepolia --rpc-url <rpc-url> --private-key <private-key>
pnpm cannon publish foil --chain-id 11155111 --private-key <private-key>
pnpm cannon verify foil --chain-id 11155111 --api-key <etherscan-api-key>
git add .
git commit -m "Foil v<version-number>"
git tag v<version-number>
git push origin main --tags
```

See [deployments](https://usecannon.com/packages/foil).