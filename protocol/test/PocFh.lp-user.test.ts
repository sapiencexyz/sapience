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

describe.only("FEpoch - lp user", function () {
  const GWEI_PER_ETHER = 1000000000;
  let fepoch: Contract;
  before("deploy contracts", async () => {
    fepoch = await ethers.deployContract("PocFh");
    console.log("fepoch deployed at:", fepoch.address);
  });

  describe("lp user", function () {
    before("set prices", async () => {
      await fepoch.setCurrentMarketPrice(35);
      await fepoch.setEpochTargetPrice(40);
    });

    it("deposit", async () => {
      await fepoch.deposit(1, 100);
      await assertStatus(fepoch, 1, "100", "0", "0");
    });

    it("convertCreditToGas", async () => {
      await fepoch.convertCreditToGWei(1, 100);
      await assertStatus(fepoch, 1, "0", "100000000000", "0");
    });

    it("supplies to 10-30 GWEI tick", async () => {
      await fepoch.supply(1, 100000000000, 0, 10, 30);
      await assertStatus(fepoch, 1, "0", "0", "0");
      await assertPosition(fepoch, 1, "100000000000", "0");
    });

    it("closePeriod", async () => {
      await fepoch.closePeriod(40);
      await assertStatus(fepoch, 1, "0", "0", "0");
    });

    it("close Position (distribute tokens proportionally", async () => {
      await fepoch.closePosition(1);
      await assertStatus(fepoch, 1, "0", "0", "2000000000000");
      await assertPosition(fepoch, 1, "0", "0");
    });

    it("sellGasExactIn", async () => {
      await fepoch.sellGasExactIn(1, 2000000000000);
      await assertStatus(fepoch, 1, "0", "80000000000000", "0");
    });

    it("convertGWeiToCredit", async () => {
      await fepoch.convertGWeiToCredit(1, 80000000000000);
      await assertStatus(fepoch, 1, "80000", "0", "0");
    });

    it("withdraw", async () => {
      await fepoch.withdraw(1, 80000);
      await assertStatus(fepoch, 1, "0", "0", "0");
    });
  });
});
