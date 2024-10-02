# Overview

FOIL engaged the Guardian team for an in-depth security review of their Foil Gas market. This comprehensive evaluation, conducted from August 26th to September 9th, 2024, included the development of a specialized fuzzing suite to uncover complex logical errors in various protocol states. This suite, an integral part of the audit, was created during the review period and successfully delivered upon the audit's conclusion.

# Contents

This fuzzing suite was created for the scope below, and updated for remediations at September 16th, 2024. The fuzzing suite primarily targets the core functionality found in `ConfigurationModule.sol`, `LiquidityModule.sol`, `SettlementModule.sol`, and `TradeModule.sol`.

Due to the unstable nature of fork testing, and the need to adjust prices, mock versions of Uma Oracle, and Uniswap V3 local deployment were created to resolve these issues.

A mock lens contract was created to access the states of the FOIL market which was necessary for many invariants.

[Logical coverage](test/fuzzing/helper/FoilUniswapCoverage.sol) for the main structs allow the fuzzer to view position values, Uniswap ticks, and statuses of trades with additional details beyond line coverage.

All properties tested can be found below in this readme.

## Setup

0. Go to protocol folder
```
cd packages/protocol
````

1. Install PNPM if it is not installed already

```
npm install -g pnpm@8
```

2. Install Echidna and follow the steps here using the latest master branch: [Installation Guide](https://github.com/crytic/echidna#installation) 

3. Install libraries

```
rm -rf lib/fuzzlib && forge install perimetersec/fuzzlib@main --no-commit
```

4. Install parallel version of OZ contracts
```
pnpm add @openzeppelin/contracts-v4@npm:@openzeppelin/contracts@4.9.5
```

## Usage

4. Make slither skip executable

```
chmod u+x test/fuzzing/slither
```

5. Run Echidna with no Slither check (faster debugging)

```
PATH=./test/fuzzing/:$PATH echidna test/fuzzing/Fuzz.sol --contract Fuzz --config echidna.yaml
```

If Echidna throws error `VM failed for unhandled reason, BadCheatCode 0xc657c718`, just update echidna to the latest release.

6. Run Echidna with a Slither check (slow)

````
echidna contracts/fuzzing/Fuzz.sol --contract Fuzz --config echidna.yaml
````

7. Run Foundry
```
forge test --mp test/fuzzing/FoundryPlayground.sol
```

# Scope

Repo: https://github.com/GuardianAudits/foil-fuzzing

Branch: `main`

Commit: `bc80c3a7109299cfd43b9b116bdef6ccbb533200`
Remediations: `4a00c554338ac660076a7fb491442c3506d5bce0`

```
.
├── README.md
├── cache
│   └── solidity-files-cache.json
├── cannonfile.sepolia.toml
├── cannonfile.test.toml
├── cannonfile.toml
├── echidna-corpus
├── echidna.yaml
├── foundry.toml
├── fuzzingModules
│   ├── EpochConfigurationModule.sol.fuzz
│   ├── EpochERC165Module.sol.fuzz
│   ├── EpochLiquidityModule.sol.fuzz
│   ├── EpochNftModule.sol.fuzz
│   ├── EpochSettlementModule.sol.fuzz
│   ├── EpochTradeModule.sol.fuzz
│   ├── EpochUMASettlementModule.sol.fuzz
│   ├── EpochViewsModule.sol.fuzz
│   └── README.md
├── lib
│   ├── cannon-std
│   └── fuzzlib
├── node_modules
├── out
├── package.json
├── remappings.txt
├── reproduce.py
├── src
│   ├── contracts
│   └── synthetix
├── test
│   ├── fuzzing
│   │   ├── FoundryPlayground.sol
│   │   ├── Fuzz.sol
│   │   ├── FuzzEpochConfigurationModule.sol
│   │   ├── FuzzEpochLiquidityModule.sol
│   │   ├── FuzzEpochSettlementModule.sol
│   │   ├── FuzzEpochTradeModule.sol
│   │   ├── FuzzEpochUMASettlementModule.sol
│   │   ├── FuzzSetup.sol
│   │   ├── Proxy.sol
│   │   ├── helper
│   │   │   ├── BeforeAfter.sol
│   │   │   ├── FoilUniswapCoverage.sol
│   │   │   ├── FuzzStorageVariables.sol
│   │   │   ├── postconditions
│   │   │   └── preconditions
│   │   ├── mocks
│   │   │   ├── MockERC20.sol
│   │   │   ├── MockLensModule.sol
│   │   │   ├── MockRouter.sol
│   │   │   ├── MockUMA.sol
│   │   │   └── WETH.sol
│   │   ├── properties
│   │   │   ├── Properties.sol
│   │   │   ├── PropertiesBase.sol
│   │   │   ├── PropertiesDescriptions.sol
│   │   │   ├── Properties_CONF.sol
│   │   │   ├── Properties_LIQ.sol
│   │   │   ├── Properties_SET.sol
│   │   │   ├── Properties_TRD.sol
│   │   │   └── Properties_UMA.sol
│   │   ├── slither
│   │   └── util
│   │       ├── FunctionCalls.sol
│   │       └── FuzzConstants.sol
│   └── helpers
├── tsconfig.json
├── uniswapv3
│   ├── v3-core
│   └── v3-periphery
└── verificationscript-Qmbg1KiuKNmCbL696Zu8hXUAJrTxuhgNCbyjaPyni4RXTc.txt
```

# List of assertions

| Invariant ID | Invariant Description                                                                                 | Passed | Remediations | Run Count |
| ------------ | ----------------------------------------------------------------------------------------------------- | ------ | ------------ | --------- |
| GLOBAL-01    | The price of vGAS should always be in range of the configured min/max ticks.                          | ✅     | N/A          | 10m       |
| GLOBAL-02    | The system should never revert with a `InsufficientBalance` error from the collateral token.          | ✅     | ✅           | 10m       |
| GLOBAL-03    | There should never be any liquidity outside of the [min, max] range of an epoch.                      | ✅     | ✅           | 10m       |
| GLOBAL-04    | The amount of vETH in the system, position manager & swap router should equal the max supply          | ✅     | ✅           | 10m       |
| GLOBAL-05    | "The amount of vGAS in the system, position manager & swap router should equal the max supply.";      | ✅     | ✅           | 10m       |
| TRADE-01     | The debt of a position should never be > the collateral of the position.                              | ✅     | ✅           | 10m       |
| TRADE-02     | Long positions have their debt in vETH and own vGAS                                                   | ✅     | ❌           | 10m       |
| TRADE-03     | Short positions have their debt in vGAS and own vETH.                                                 | ✅     | ✅           | 10m       |
| LIQUID-01    | The debt of a position should not be > the collateral of the position.                                | ✅     | ✅           | 10m       |
| LIQUID-02    | A open LP position should not own any vETH or vGAS.                                                   | ✅     | ✅           | 10m       |
| LIQUID-03    | After all LP positions have been closed, for the remaining trader positions: net shorts == net longs. | ✅     | ✅           | 10m       |
| SETTLE-01    | It should always be possible to close all positions after the epoch is settled.                       | ❌     | N/A          | 10m       |
| STLESS-01    | UniV3 and Foils getAmount0ForLiquidity should output the same value when given the same inputs.       | ❌     | ❌           | 10m       |
| POSITION-01  | Foil should never try and send out more collateral than it has.                                       | ✅     | ✅           | 10m       |
| POSITION-02  | Position with non zero loan amount for trader should always have non-zero collateral required         | ✅     | ✅           | 10m       |
| EPOCH-01     | Position with non zero loan amount for lp should always have non-zero collateral required.            | ✅     | ✅           | 10m       |

# Remediations

## List of invariants changed:

- GLOBAL-1 was excluded and added as a requirement for a function progress.
- SETTLE-1 was excluded since it's not possible to manage position after the epoch is settled.
- TRADE-02 was falsified, see FoundryPlayground.sol::test_repro_TRADE_02().
- STLESS-01 was falsified, see FoundryPlayground.sol::test_repro_TRADE_02() and test_fuzz_getAmount0ForLiquidityFoilVsUni.

## Features

To reproduce with Foundry, set `FuzzStorageVariables::REPRO_MODE` to true. This switches the modifier to use only one actor in all calls.

## Coverage

This deployment includes stack-consuming Uniswap V3 deployment, so optimizer usage is needed. The optimizer negatively impacts coverage coloring, as it merges some repeated function usage, etc. As a workaround, we mocked state changes with `stateChangerVar` to show that all key functions were definitely covered.
