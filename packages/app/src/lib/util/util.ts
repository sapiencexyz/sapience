import JSBI from "jsbi";
import {
  formatEther,
  type ReadContractErrorType,
  type WriteContractErrorType,
} from "viem";
import * as chains from "viem/chains";
import type { Chain } from "viem/chains";

import { TimeWindow } from "../interfaces/interfaces";

export function convertHundredthsOfBipToPercent(
  hundredthsOfBip: number,
): number {
  // 1 bip = 0.01%
  // 1 hundredth of bip = 0.01/100 = 0.0001
  return (hundredthsOfBip * 0.0001) / 100;
}

export function getDisplayTextForVolumeWindow(volumeWindow: TimeWindow) {
  if (volumeWindow === TimeWindow.H) {
    return "Past Hour";
  }
  if (volumeWindow === TimeWindow.D) {
    return "Past Day";
  }
  if (volumeWindow === TimeWindow.W) {
    return "Past Week";
  }
  if (volumeWindow === TimeWindow.M) {
    return "Past Month";
  }
  if (volumeWindow === TimeWindow.Y) {
    return "Past Year";
  }
  return "";
}

// TODO: Adjust this based on fee rate on the market
export const tickToPrice = (tick: number): number => 1.0001 ** tick;

export function getChain(chainId: number): Chain {
  for (const chain of Object.values(chains)) {
    if (chain.id === chainId) {
      return chain;
    }
  }

  throw new Error(`Chain with id ${chainId} not found`);
}

export const convertWstEthToGwei = (
  wstEth: number,
  stEthPerToken: number | undefined,
) => {
  return (wstEth * 1e9) / (stEthPerToken || 1);
};

export const convertGgasPerWstEthToGwei = (
  value: number,
  stEthPerToken: number | undefined,
) => {
  return (value * (stEthPerToken || 1)) / 1e9;
};

export const gweiToEther = (gweiValue: bigint): string => {
  // First, convert gwei to wei (multiply by 10^9)
  const weiValue = gweiValue * BigInt(1e9);
  // Then use formatEther to convert wei to ether
  return formatEther(weiValue);
};

export const shortenAddress = (address: string) => {
  if (address.length < 12) {
    return address;
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

/**
 * Removes leading zeros from a string or number input while preserving valid number format
 * @param input - The input string or number to process
 * @returns A string with leading zeros removed while maintaining decimal points and negative signs
 */
export const removeLeadingZeros = (input: string | number): string => {
  // Convert input to string if it's a number
  const str = input.toString();

  // Handle empty string
  if (!str) return str;

  // Handle zero
  if (str === "0") return "0";

  // Handle decimal numbers starting with 0 (e.g., 0.123)
  if (str.match(/^0\./)) return str;

  // Handle negative numbers
  if (str.startsWith("-")) {
    const withoutMinus = str.slice(1);
    const processed = removeLeadingZeros(withoutMinus);
    return processed === "0" ? "0" : `-${processed}`;
  }

  // Remove leading zeros and return
  return str.replace(/^0+/, "") || "0";
};

export function JSBIAbs(value: JSBI): JSBI {
  return JSBI.lessThan(value, JSBI.BigInt(0))
    ? JSBI.multiply(value, JSBI.BigInt(-1))
    : value;
}
