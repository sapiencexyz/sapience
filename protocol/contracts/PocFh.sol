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

    struct positionData {
        uint id;
        uint amountGwei;
        uint amountGGas;
        uint priceMin;
        uint priceMax;
    }

    mapping(uint => accountData) public accounts;
    mapping(uint => positionData) public positions;

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

    function convertCreditToGGas(
        uint id,
        uint creditAmount,
        uint price
    ) external {
        accountData storage a = accounts[id];
        require(a.id == id, "invalid account");

        require(a.credit >= creditAmount, "not enough credit");

        a.credit -= creditAmount;
        a.ggasAmount += creditAmount * price;
    }

    function convertGGasToCredit(uint id, uint amount, uint price) external {
        accountData storage a = accounts[id];
        require(a.id == id, "invalid account");

        require(a.ggasAmount >= amount, "not enough gwei");

        a.ggasAmount -= amount;
        a.credit += amount / price;
    }

    // ------- Pool operations ------
    function supply(
        uint id,
        uint amountGwei,
        uint amountGGas,
        uint priceMin,
        uint priceMax
    ) external {
        accountData storage a = accounts[id];
        require(a.id == id, "invalid account");

        positionData storage p = positions[id];

        require(a.gweiAmount >= amountGwei, "not enough gwei");
        require(a.ggasAmount >= amountGGas, "not enough ggas");

        a.gweiAmount -= amountGwei;
        a.ggasAmount -= amountGGas;

        p.id = id;
        p.amountGwei += amountGwei;
        p.amountGGas += amountGGas;

        p.priceMin = priceMin;
        p.priceMax = priceMax;
    }

    function closePosition(uint id) external {
        accountData storage a = accounts[id];
        require(a.id == id, "invalid account");

        positionData storage p = positions[id];

        if (epochSettlementPrice >= p.priceMax) {
            uint midRange = (p.priceMin + p.priceMax) / 2;
            // Passing through range means user sold all GAS tokens for GWEI tokens (@GAS/GWEI = mid range price)
            a.ggasAmount += p.amountGwei * midRange;
            a.gweiAmount += 0;
            p.amountGGas = 0;
            p.amountGwei = 0;
        } else if (epochSettlementPrice <= p.priceMin) {
            uint midRange = (p.priceMin + p.priceMax) / 2;
            // Passing through range means user sold all GWEI tokens for GAS tokens (@GWEI/GAS = mid range price)
            a.gweiAmount += p.amountGGas * midRange;
            a.ggasAmount += 0;

            a.ggasAmount += p.amountGwei / (p.priceMin + p.priceMax) / 2;
            a.gweiAmount -= p.amountGwei;
            p.amountGGas = 0;
            p.amountGwei = 0;
        } else {
            // In price range, it means user has sold some based on the price
            uint amountGwei = (epochSettlementPrice - p.priceMin) *
                p.amountGGas;
            uint amountGGas = (p.priceMax - epochSettlementPrice) *
                p.amountGGas;
            a.gweiAmount += amountGwei;
            a.ggasAmount += amountGGas;

            p.amountGGas = 0;
            p.amountGwei = 0;
        }
    }

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
