# Foil MCP Server

## Tools

* `graphql` queries the Foil API for information about each entity in the database:
  * `listResources` - Lists all resources available in the Foil system
  * `listMarkets` - Lists all markets available in the Foil system
  * `getResource` - Gets detailed information about a specific resource by its slug
  * `getMarket` - Gets detailed information about a specific market by its address and chain ID
  * `getEpochs` - Gets information about epochs (periods) in the system, optionally filtered by market ID
  * `getPositions` - Gets information about positions, optionally filtered by chain ID, market address, or owner
  * `getTransactions` - Gets transaction history, optionally filtered by position ID
* `writeFoilContracts` returns the call data to sign for the following functions:
  * `quoteCreateTraderPosition` - Gets a quote for creating a new trader position
  * `createTraderPosition` - Creates a new trader position with specified parameters
  * `quoteModifyTraderPosition` - Gets a quote for modifying an existing trader position
  * `modifyTraderPosition` - Modifies an existing trader position with new parameters
  * `quoteLiquidityPosition` - Gets a quote for creating a new liquidity position
  * `createLiquidityPosition` - Creates a new liquidity position with specified parameters
  * `quoteModifyLiquidityPosition` - Gets a quote for modifying an existing liquidity position
  * `modifyLiquidityPosition` - Modifies an existing liquidity position with new parameters
* `readFoilContracts` returns information from a given Foil contract via the following functions:
  * `getReferencePrice` - Gets the reference price for a market
  * `getMarketInfo` - Gets detailed information about a market's configuration
  * `getEpochInfo` - Gets detailed information about a specific epoch
  * `getLatestEpochInfo` - Gets information about the most recent epoch
  * `getTokenOwner` - Gets the owner address of a specific position token
  * `getTokenByIndex` - Gets a position token ID by its index
  * `getPosition` - Gets detailed position data including kind, epoch, collateral amounts, borrowed amounts, etc.
  * `getPositionCollateralValue` - Gets the collateral value of a position
  * `getPositionPnl` - Gets the PnL of a position
  * `getPositionSize` - Gets the size of a position
  * `getSqrtPriceX96` - Gets the square root price for an epoch
  * `getDecimalPriceFromSqrtPriceX96` - Converts sqrt price to decimal price
  * `getMarketTickSpacing` - Gets the tick spacing for the market
  * `totalSupply` - Gets total number of positions
  * `balanceOf` - Gets number of positions owned by an address