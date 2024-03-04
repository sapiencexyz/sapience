const { ethers } = require("hardhat");
import { Contract } from "ethers";

import { assertStatus, GWEI_PER_ETHER } from "./helpers";

describe("FEpoch - rollup user", function () {
  let fepoch: Contract;
  let gweiAmount: number, ggasAmount: number;
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
      gweiAmount = 1050 * GWEI_PER_ETHER;
      await assertStatus(fepoch, 1, "0", gweiAmount.toString(), "0");
    });

    it("buyGasExactIn", async () => {
      await fepoch.buyGasExactIn(1, gweiAmount);
      ggasAmount = gweiAmount / 35;
      await assertStatus(fepoch, 1, "0", "0", ggasAmount.toString());
    });

    it("closePeriod", async () => {
      await fepoch.closePeriod(50);
      await assertStatus(fepoch, 1, "0", "0", ggasAmount.toString());
    });

    it("sellGasExactIn", async () => {
      await fepoch.sellGasExactIn(1, ggasAmount);
      gweiAmount = ggasAmount * 50;
      await assertStatus(fepoch, 1, "0", gweiAmount.toString(), "0");
    });

    it("convertGWeiToCredit", async () => {
      await fepoch.convertGWeiToCredit(1, gweiAmount);
      await assertStatus(fepoch, 1, "1500", "0", "0");
    });

    it("withdraw", async () => {
      await fepoch.withdraw(1, 1500);
      await assertStatus(fepoch, 1, "0", "0", "0");
    });
  });
});
