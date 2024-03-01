// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

contract PocFh {
    uint private constant GWEI_PER_ETHER = 1000000000;

    uint public epochTargetPrice; // Price at end of period (in gwei/gas)
    uint public epochSettlementPrice; // Price at end of period (in gwei/gas)
    uint public currentMarketPrice; // UniV3 price based on deposits (in gwei/gas)
    bool public isClosed; // time passed and epoch is closed, valid price is epoch price

    struct accountData {
        uint id;
        uint credit;
        uint gweiAmount;
        uint ggasAmount;
    }

    mapping(uint => accountData) public accounts;

    // ------ Administrative (in fact external) -------
    function setEpochTargetPrice(uint _epochTargetPrice) external {
        epochTargetPrice = _epochTargetPrice;
    }

    function setCurrentMarketPrice(uint _currentMarketPrice) external {
        currentMarketPrice = _currentMarketPrice;
    }

    function closePeriod(uint price) external {
        require(isClosed == false, "already closed");
        require(price == epochTargetPrice, "not target price");

        epochSettlementPrice = price;
        isClosed = true;
    }

    // ------
    function deposit(uint id, uint amount) external {
        accountData storage a = accounts[id];
        a.id = id;
        a.credit += amount;
    }

    function withdraw(uint id, uint amount) external {
        accountData storage a = accounts[id];
        require(a.id == id, "invalid account");

        require(a.credit >= amount, "not enough credit");

        a.credit -= amount;
    }

    function convertCreditToGWei(uint id, uint amount) external {
        accountData storage a = accounts[id];
        require(a.id == id, "invalid account");

        require(a.credit >= amount, "not enough credit");

        a.credit -= amount;
        a.gweiAmount += amount * GWEI_PER_ETHER;
    }

    function convertGWeiToCredit(uint id, uint amount) external {
        accountData storage a = accounts[id];
        require(a.id == id, "invalid account");

        require(a.gweiAmount >= amount, "not enough gwei");

        a.gweiAmount -= amount;
        a.credit += amount / GWEI_PER_ETHER;
    }

    // ------- Pool operations ------
    function buyGasExactIn(uint id, uint amountGwei) external {
        accountData storage a = accounts[id];
        require(a.id == id, "invalid account");

        require(a.gweiAmount >= amountGwei, "not enough gwei");

        uint rate = isClosed ? epochSettlementPrice : currentMarketPrice;
        a.gweiAmount -= amountGwei;
        a.ggasAmount += amountGwei / rate;
    }

    function buyGasExactOut(uint id, uint amountGas) external {
        // TODO
    }

    function sellGasExactIn(uint id, uint amountGas) external {
        accountData storage a = accounts[id];
        require(a.id == id, "invalid account");

        require(a.ggasAmount >= amountGas, "not enough ggas");

        uint rate = isClosed ? epochSettlementPrice : currentMarketPrice;
        a.ggasAmount -= amountGas;
        a.gweiAmount += amountGas * rate;
    }

    function sellGasExactOut(uint id, uint amountGwei) external {
        // TODO
    }
}
