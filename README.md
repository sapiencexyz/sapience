# 👽 Foil

- Start the protocol on a local node
  - First delete the deployment directory `packages/protocol/deployments/13370`
  - `pnpm run dev:protocol` and press `i` to interact with it
- Start the app
  - `pnpm run dev:app` and access at http://localhost:3000
  - Connect your wallet application to http://localhost:8545 (Chain ID 13370) **Remember to reset the nonce in the wallet after restarting the node.**
- Start the data service
  - if you're starting the schema from scratch, you'll need to first run `NODE_ENV=development pnpm --filter data run dev:worker` to create the necessary tables for the database. Once that finishes initializing the database, you can kill the data service with `CNTRL+C` and run the command below to restart it with both the `worker` and `service` running.
  - `pnpm run dev:data` and access at http://localhost:3001
- Start the website
  - `pnpm run dev:website` and access at http://localhost:3002
- Start the docs
  - `pnpm run dev:docs` and access at http://localhost:3003

## Deploy

- Go to `/packages/protocol`
- Increment the version number in the cannonfiles
- Run `pnpm simulate-deploy:sepolia` to verify there are no issues
- Run `CANNON_PRIVATE_KEY=x CANNON_PROVIDER_URL=y pnpm deploy:sepolia` (or set those values in a `.env` file)
