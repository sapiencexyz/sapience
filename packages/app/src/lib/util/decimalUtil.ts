import BN from 'bignumber.js';
import { BigNumber, BigNumberish } from 'ethers';

BN.config({ EXPONENTIAL_AT: 999999, DECIMAL_PLACES: 40 });

export function encodePriceSqrt(num: BigNumberish): BigNumber {
  return BigNumber.from(
    new BN(num.toString())
      .sqrt()
      .multipliedBy(new BN(2).pow(96))
      .integerValue(3)
      .toString()
  );
}
