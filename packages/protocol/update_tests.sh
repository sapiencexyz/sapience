#!/bin/bash

# Update all test files with the refactoring changes

echo "Updating test files..."

# Find all test files
find test -name "*.t.sol" -o -name "*.sol" | while read file; do
  echo "Processing: $file"
  
  # Skip helper files that were already updated
  if [[ "$file" == *"TestMarket.sol"* || "$file" == *"TestTrade.sol"* || "$file" == *"TestVault.sol"* ]]; then
    echo "  Skipping already updated helper file"
    continue
  fi
  
  # Update imports
  sed -i '' 's/import {IFoil} from/import {ISapience} from/g' "$file"
  sed -i '' 's/import {IFoilStructs} from/import {ISapienceStructs} from/g' "$file"
  sed -i '' 's/import {IFoilPositionEvents} from/import {ISapiencePositionEvents} from/g' "$file"
  sed -i '' 's/import {TestEpoch} from/import {TestMarket} from/g' "$file"
  sed -i '' 's/import {Epoch} from/import {Market} from/g' "$file"
  sed -i '' 's/import "\.\.\/helpers\/TestEpoch\.sol"/import "..\/helpers\/TestMarket.sol"/g' "$file"
  sed -i '' 's/import "\.\/helpers\/TestEpoch\.sol"/import ".\/helpers\/TestMarket.sol"/g' "$file"
  
  # Update interface references
  sed -i '' 's/IFoil\./ISapience./g' "$file"
  sed -i '' 's/IFoilStructs\./ISapienceStructs./g' "$file"
  sed -i '' 's/IFoilPositionEvents\./ISapiencePositionEvents./g' "$file"
  
  # Update contract inheritance
  sed -i '' 's/is TestEpoch/is TestMarket/g' "$file"
  
  # Update variable declarations
  sed -i '' 's/IFoil foil/ISapience sapience/g' "$file"
  sed -i '' 's/IFoil private foil/ISapience private sapience/g' "$file"
  sed -i '' 's/IFoil public foil/ISapience public sapience/g' "$file"
  sed -i '' 's/IFoil internal foil/ISapience internal sapience/g' "$file"
  
  # Update variable names
  sed -i '' 's/epochId/marketId/g' "$file"
  sed -i '' 's/EpochData/MarketData/g' "$file"
  sed -i '' 's/ethToken/quoteToken/g' "$file"
  sed -i '' 's/gasToken/baseToken/g' "$file"
  sed -i '' 's/vETH/vQuote/g' "$file"
  sed -i '' 's/vGAS/vBase/g' "$file"
  sed -i '' 's/vEth/vQuote/g' "$file"
  sed -i '' 's/vGas/vBase/g' "$file"
  sed -i '' 's/borrowedVEth/borrowedVQuote/g' "$file"
  sed -i '' 's/borrowedVGas/borrowedVBase/g' "$file"
  sed -i '' 's/vEthAmount/vQuoteAmount/g' "$file"
  sed -i '' 's/vGasAmount/vBaseAmount/g' "$file"
  
  # Update function calls
  sed -i '' 's/createEpoch/createMarket/g' "$file"
  sed -i '' 's/getEpoch/getMarket/g' "$file"
  sed -i '' 's/getLatestEpoch/getLatestMarket/g' "$file"
  sed -i '' 's/lastEpochId/lastMarketId/g' "$file"
  sed -i '' 's/settleEpoch/settleMarket/g' "$file"
  sed -i '' 's/initializeFirstEpoch/initializeFirstMarket/g' "$file"
  
  # Update error messages
  sed -i '' 's/InvalidEpoch/InvalidMarket/g' "$file"
  sed -i '' 's/ExpiredEpoch/ExpiredMarket/g' "$file"
  sed -i '' 's/epoch/market/g' "$file" # Be careful with this one
  sed -i '' 's/Epoch/Market/g' "$file" # Be careful with this one
  
  # Update Foil references
  sed -i '' 's/foil = IFoil/sapience = ISapience/g' "$file"
  sed -i '' 's/foil\./sapience./g' "$file"
  sed -i '' 's/Foil(/Sapience(/g' "$file"
  sed -i '' 's/address(foil)/address(sapience)/g' "$file"
  sed -i '' 's/vm\.getAddress("Foil")/vm.getAddress("Sapience")/g' "$file"
  sed -i '' 's/"Foil"/"Sapience"/g' "$file"
  
  # Update specific error selectors
  sed -i '' 's/Errors\.InvalidMarket\.selector/Errors.InvalidMarket.selector/g' "$file"
  sed -i '' 's/Errors\.ExpiredMarket\.selector/Errors.ExpiredMarket.selector/g' "$file"
done

echo "Test files updated!"