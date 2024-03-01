const { ethers } = require("hardhat");
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
  assert.equal(status[1].toString(), credit);
  assert.equal(status[2].toString(), gweiAmount);
  assert.equal(status[3].toString(), ggasAmount);
};

describe("FEpoch - rollup user", function () {
  const GWEI_PER_ETHER = 1000000000;
  let fepoch: Contract;
  before("deploy contracts", async () => {
    fepoch = await ethers.deployContract("PocFh");
    console.log("fepoch deployed at:", fepoch.address);
  });

  describe("rollup user", function () {
    before("set prices", async () => {
      await fepoch.setCurrentMarketPrice(35);
      await fepoch.setEpochTargetPrice(50);
    });

    it("deposit", async () => {
      await fepoch.deposit(1, 1050);
      await assertStatus(fepoch, 1, "1050", "0", "0");
    });

    it("convertCreditToGWei", async () => {
      await fepoch.convertCreditToGWei(1, 1050);
      await assertStatus(fepoch, 1, "0", "1050000000000", "0");
    });

    it("buyGasExactIn", async () => {
      await fepoch.buyGasExactIn(1, 1050 * GWEI_PER_ETHER);
      await assertStatus(fepoch, 1, "0", "0", "30000000000");
    });

    it("closePeriod", async () => {
      await fepoch.closePeriod(50);
      await assertStatus(fepoch, 1, "0", "0", "30000000000");
    });

    it("sellGasExactIn", async () => {
      await fepoch.sellGasExactIn(1, 30000000000);
      await assertStatus(fepoch, 1, "0", "1500000000000", "0");
    });

    it("convertGWeiToCredit", async () => {
      await fepoch.convertGWeiToCredit(1, 1500000000000);
      await assertStatus(fepoch, 1, "1500", "0", "0");
    });

    it("withdraw", async () => {
      await fepoch.withdraw(1, 1500);
      await assertStatus(fepoch, 1, "0", "0", "0");
    });
  });
});
