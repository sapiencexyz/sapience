const { assert } = require("chai");

import { Contract } from "ethers";

const assertStatus = async (
  fepoh: Contract,
  accountId: number,
  credit: string,
  gweiAmount: string,
  ggasAmount: string
) => {
  const status = await fepoh.accounts(accountId);
  assert.equal(status[1].toString(), credit, "credit");
  assert.equal(status[2].toString(), gweiAmount, "gwei");
  assert.equal(status[3].toString(), ggasAmount, "ggas");
};

const assertPosition = async (
  fepoh: Contract,
  accountId: number,
  gweiAmount: string,
  ggasAmount: string
) => {
  const status = await fepoh.positions(accountId);
  assert.equal(status[1].toString(), gweiAmount, "gwei");
  assert.equal(status[2].toString(), ggasAmount, "ggas");
};

const GWEI_PER_ETHER = 1e9;

export { assertStatus, assertPosition, GWEI_PER_ETHER };
