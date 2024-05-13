const { ethers } = require("hardhat");
import { Contract } from "ethers";
import { assertStatus, GWEI_PER_ETHER, assertPosition } from "./PocFhHelpers";
import { assert } from "chai";

describe("FEpoch - lp user", function () {
  let fepoch: Contract;
  before("deploy contracts", async () => {
    fepoch = await ethers.deployContract("PocFh");
    console.log("fepoch deployed at:", fepoch.address);
  });

  describe("lp user", function () {
    let gweiAmount: number, ggasAmount: number;
    before("set prices", async () => {
      await fepoch.setCurrentMarketPrice(10);
      await fepoch.setEpochTargetPrice(40);
    });

    it("deposit", async () => {
      await fepoch.deposit(1, 100);
      await assertStatus(fepoch, 1, "100", "0", "0");
    });

    it("buy gas with credit", async () => {
      ggasAmount = 1 * GWEI_PER_ETHER;
      await fepoch.mintGGas(1, ggasAmount);
      await assertStatus(fepoch, 1, "100", "0", ggasAmount.toString());
    });

    it("supplies to 10-30 GWEI tick", async () => {
      await fepoch.supply(1, 0, ggasAmount, 10, 30);
      await assertStatus(fepoch, 1, "100", "0", "0");
      await assertPosition(fepoch, 1, "0", ggasAmount.toString());
    });

    it("closePeriod", async () => {
      await fepoch.closePeriod(40);
      await fepoch.setCurrentMarketPrice(40);
      await assertStatus(fepoch, 1, "100", "0", "0");
    });

    it("close Position (distribute tokens proportionally)", async () => {
      await fepoch.closePosition(1);
      // at close position, the original deposited gas is sold since the range was crossed. It's sold as half range price
      gweiAmount = ggasAmount * 20;
      await assertStatus(fepoch, 1, "100", gweiAmount.toString(), "0");
      await assertPosition(fepoch, 1, "0", "0");
    });

    it("move back gwei to gas at current price", async () => {
      await fepoch.buyGasExactIn(1, gweiAmount);
      ggasAmount = gweiAmount / 40;
      await assertStatus(fepoch, 1, "100", "0", ggasAmount.toString());
      assert.equal(ggasAmount, 0.5 * GWEI_PER_ETHER, "ggasAmount");
    });

    it("buy more gas to pay debt", async () => {
      await fepoch.convertCreditToGGas(1, 0.5 * GWEI_PER_ETHER);
      ggasAmount = 1 * GWEI_PER_ETHER;
      await assertStatus(fepoch, 1, "80", "0", ggasAmount.toString());
    });

    it("pay debt", async () => {
      await fepoch.payDebt(1, ggasAmount);
      await assertStatus(fepoch, 1, "80", "0", "0");
    });

    it("withdraw", async () => {
      await fepoch.withdraw(1, 80);
      await assertStatus(fepoch, 1, "0", "0", "0");
    });
  });
});
