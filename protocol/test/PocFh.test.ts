const { ethers } = require("hardhat");

describe("FEpoch", function () {
  const GWEI_PER_ETHER = 1000000000;
  let fepoch: any;
  before("deploy contracts", async () => {
    
    fepoch = await ethers.deployContract("PocFh");
    console.log("fepoch deployed at:", fepoch.address);
  });


  it("test initial value", async () => {
    console.log("Set prices");
    await fepoch.setCurrentMarketPrice(35);
    await fepoch.setEpochTargetPrice(50);

    console.log("Rollup user deposits 1050 ETH");
    await fepoch.deposit(1, 1050);
    console.log("credit     ", (await fepoch.accounts(1))[1].toString());
    console.log("gweiAmount ", (await fepoch.accounts(1))[2].toString());
    console.log("ggasAmount ", (await fepoch.accounts(1))[3].toString());

    console.log("Rollup user converts to gwei");
    await fepoch.convertCreditToGWei(1, 1050);
    console.log("credit     ", (await fepoch.accounts(1))[1].toString());
    console.log("gweiAmount ", (await fepoch.accounts(1))[2].toString());
    console.log("ggasAmount ", (await fepoch.accounts(1))[3].toString());

    console.log("Rollup user buys ggas at 35");
    await fepoch.buyGasExactIn(1, 1050 * GWEI_PER_ETHER);

    console.log("Settlement price is 50, settle");
    await fepoch.closePeriod(50);
    console.log("credit     ", (await fepoch.accounts(1))[1].toString());
    console.log("gweiAmount ", (await fepoch.accounts(1))[2].toString());
    console.log("ggasAmount ", (await fepoch.accounts(1))[3].toString());

    console.log("Rollup user sells ggas at settlement price (50)");
    await fepoch.sellGasExactIn(1, 30000000000);
    console.log("credit     ", (await fepoch.accounts(1))[1].toString());
    console.log("gweiAmount ", (await fepoch.accounts(1))[2].toString());
    console.log("ggasAmount ", (await fepoch.accounts(1))[3].toString());

    console.log("Rollup user converts to gwei");
    await fepoch.convertGWeiToCredit(1, 1500000000000);
    console.log("credit     ", (await fepoch.accounts(1))[1].toString());
    console.log("gweiAmount ", (await fepoch.accounts(1))[2].toString());
    console.log("ggasAmount ", (await fepoch.accounts(1))[3].toString());

    console.log("Rollup user witdraws 1500 ETH");
    await fepoch.withdraw(1, 1500);
    console.log("credit     ", (await fepoch.accounts(1))[1].toString());
    console.log("gweiAmount ", (await fepoch.accounts(1))[2].toString());
    console.log("ggasAmount ", (await fepoch.accounts(1))[3].toString());
  });
});
