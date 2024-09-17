# 👽 Foil

- Start the protocol on a local node
  - `pnpm run dev:protocol` and press `i` to interact with it
- Start the app
  - `pnpm run dev:app` and access at http://localhost:3000
  - Connect your wallet application to http://localhost:8545 (Chain ID 13370) **Remember to reset the nonce in the wallet after restarting the node.**
- Start the data service
  - `pnpm run dev:data` and access at http://localhost:3001
- Start the website
  - `pnpm run dev:website` and access at http://localhost:3002
- Start the docs
  - `pnpm run dev:docs` and access at http://localhost:3003

## Deploy

- Go to `/packages/protocol`
- Bump the version in `/packages/protocol/package.json`
- Run `pnpm simulate-deploy:sepolia` to verify there are no issues
- Run `CANNON_PRIVATE_KEY=x CANNON_PROVIDER_URL=y pnpm deploy:sepolia` (or set those values in a `.env` file)
- `git add .`
- `git commit -m "Foil v<version-number>"`
- `git tag v<version-number>`
- `git push --follow-tags`