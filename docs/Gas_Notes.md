# Gas Insurance

Orgs can buy insurance for their transactions (hedge gas price fluctuations) for a period of time, after that period if average gas price was higher than the insured value, they get paid the difference.
Based on futures contracts, and uniswap pools. The hedging is done by longing the gas average price for, i.e. 3 months, and LPs provide liquidity for the different gas prices ranges on that future average price.


## Overview
Based on Uni pool for liquidity, and contracts to manage the insurance. 


## Architecture

### Fees
- Insurance fee: A% of the insured amount (paid to protocol)
- Uniswap fee: B% of the insured amount (paid to LPs)
- FE fee: C% of the insured amount (paid to FE)
- Total fee: (A+B+C)% of the insured amount

### Pools 
Uniswap pool with LPs providing liquidity for different gas prices ranges. 

questions:
- do we need to provide different pools for each period? (most likely not, just one pool for all periods / price ranges)

#### Pair
- GasETH / FoilFuture

### Oracle 
Average gas price for a period.

questions:
- how to get the average gas price for a period? (oracle)
- how to get the average gas price for a period in the past? (oracle)
- do we need different oracles for each period duration? i.e. 30d, 60d, 90d, 180d, 360d 
  

### Contracts 
Futures. Settled at the end of the period with the prices from the oracle.
The contract holds a list of open positions (insurance subscriptions) and their values, amount start and end time.
The settlement can only be done at the end of the period.



### Frontend 
One-click insurance subscription. Hedge user "buys" a certain amount of ETH for gas at a certain price for a certain period of time.



## Reference
### Uniswap V3
- https://uniswap.org/whitepaper-v3.pdf
- https://github.com/Uniswap/v3-core
- https://github.com/Uniswap/v3-periphery
- https://blog.uniswap.org/uniswap-v3



### Uniswap V4
- https://docs.uniswap.org/
- https://blog.uniswap.org/how-uniswapv4-uniswapx-work-together#best-liquidity-with-uniswap-v4
- https://github.com/Uniswap/v4-core
- https://github.com/Uniswap/v4-periphery/

- https://github.com/naddison36/uniswap-v4-hooks#local-testing
- https://uniswaphooks.com/components/hooks/from-the-community


### Perpetual Protocol
- https://docs.perp.com/docs/contracts/ClearingHouse/
https://support.perp.com/hc/en-us/articles/5748372509081-Perpetual-Uniswap
- https://www.synfutures.com/v3-whitepaper.pdf

- https://github.com/perpetual-protocol/perp-curie-contract
- https://github.com/perpetual-protocol/sdk-curie



# Questions

- what type of collaterals do we need? (ETH, DAI, USDC, USDT, etc.)


## Use case
Time 0
- User A (Staker) deposits x collateral at 40 gwei tick
- User B (L2 Hedger) buys 3ETH of insureance for next 90 days at 40 gwei tick. Deposits some collateral.



Time passes - 90 days
#### CASE Average gas price for the period was 50 gwei
Token 0 = Insured price average at end of period

Token 1 = Real Price average at end of period
- (perpsProtocol idea): Price = 40/50 = 0.8
- 3ETH * 0.8 = 2.4ETH 
- User B gets 3 - 2.4 = 0.6ETH + Collateral back
#### CASE Average gas price for the period was 30 gwei
