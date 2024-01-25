# Other notes

## General 

Communications: Signal could work for now, but Discord will help a lot later on.

## Architecture
Opinionated definitions and assumptions.

### Repositories
- [LEO] I would suggest to have a single repo for the MVP, and then split it into multiple repos as/if needed.
- [LEO] Github  
- CI / CD (Github Actions / CircleCI / TravisCI / Jenkins / Other)

### Wallets
- Deployments (EOA for now)
- Ownership (EOA for now, then Gnosis Safe multisig)
- Funds 
  - Gnosis safe multisig for funds
  - Gnosis safe multisig for operational costs (gas for transactions, subscription services, travel expenses, etc.)
  - Gnosis safe multisig for wages 

### EVM  
- Solidity / Vyper ([LEO]I prefer Solidity)
- Hardhat / Anvil
- OpenZeppelin Contracts as dependencies (Yes/No)
- Cannon / Scripts
- Networks -> Ethernet mainnet
- ethers.js version (if solidity, v5 or v6?)
- JS/TS ([LEO] JS for MVP can work, but then absolutely TS)
- Node version ([LEO] latest)

### Integrations
- Uniswap V3 / V4 ([LEO] depending on launch dates for V4... maybe V3 for MVP, V4 later)


### Frontend

### 
