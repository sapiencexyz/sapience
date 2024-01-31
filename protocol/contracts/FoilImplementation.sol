// contracts/FoilImplementation.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./GasToken.sol";
import "./GasWeiToken.sol";
import "./FoilNFT.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";

contract FoilImplementation {
    // FoilNFT represents the account of an user. It is a NFT that can be transferred to other users.
    FoilNFT public foilNFT;

    uint256 private constant GAS_TOKEN = 1;
    uint256 private constant WEI_TOKEN = 2;

    constructor(address _foilNFT) {
        foilNFT = FoilNFT(_foilNFT);
    }

    function settleEpoch(uint256 epochId) external {
        // TODO check if epoch is valid
        // TODO check if epoch is over
        // TODO check if epoch is not settled
        // TODO settle epoch
        // notice: settling an epoch involves setting the epoch as settled, pausing the two tokens and fixing the price of the gas
        // TODO pay fee to settler
    }

    function payDebt(uint256 accountId, uint256 epochId) external {
        // TODO check if account is valid
        // TODO check msg.sender is approved by the account
        // TODO check if account is not paused
        // TODO check if can pay that amount
        // notice: using the epoch rate, calculate the amount of gas tokens and wei tokens to burn, the user holding and swap them to pay. If needed it will mint more from the deposited collateral
        // TODO adjust balances
    }

    function accountEpochDebt(
        uint256 accountId,
        uint256 epochId
    ) external view returns (uint256) {
        // TODO check if account is valid
        // TODO check msg.sender is approved by the account
        // TODO check if account is not paused
        // TODO calculate current debt
    }

    function accountGlobalDebt(
        uint256 accountId
    ) external view returns (uint256) {
        // TODO check if account is valid
        // TODO check msg.sender is approved by the account
        // TODO check if account is not paused
        // TODO calculate current debt
    }

    function accountLiquidatable(
        uint256 accountId
    ) external view returns (bool) {
        // TODO check if account is valid
        // TODO check msg.sender is approved by the account
        // TODO check if account is not paused
        // TODO check if account is liquidatable
    }

    function liquidateAccount(uint256 accountId) external {
        // TODO check if account is valid
        // TODO check msg.sender is approved by the account
        // TODO check if account is not paused
        // TODO check if account is liquidatable
        // TODO liquidate account
        // notice: liquidating an account involves burning all the gas tokens and wei tokens, adjust balances (remaining colalteral stay here to pay other LPs)
        // TODO pay fee to liquidator
        // TODO adjust balances
    }

    function deposit(uint256 accountId, uint256 amount) external {
        // TODO check if account is valid
        // TODO check msg.sender is approved by the account
        // TODO check if account is not paused
        // TODO transfer amount from msg.sender to this contract
        // TODO adjust balances
    }

    function withdraw(uint256 accountId, uint256 amount) external {
        // TODO check if account is valid
        // TODO check msg.sender is approved by the account
        // TODO check if account is not paused
        // TODO check if can withdraw that amount
        // TODO transfer amount from this contract to msg.sender
        // TODO adjust balances
    }

    function mintGasToken(
        uint256 accountId,
        uint256 amount,
        uint256 epochId
    ) external {
        _mintToken(accountId, amount, epochId, GAS_TOKEN);
    }

    function burnGasToken(
        uint256 accountId,
        uint256 amount,
        uint256 epochId
    ) external {
        _burnToken(accountId, amount, epochId, GAS_TOKEN);
    }

    function mintWeiToken(
        uint256 accountId,
        uint256 amount,
        uint256 epochId
    ) external {
        _mintToken(accountId, amount, epochId, WEI_TOKEN);
    }

    function burnWeiToken(
        uint256 accountId,
        uint256 amount,
        uint256 epochId
    ) external {
        _burnToken(accountId, amount, epochId, WEI_TOKEN);
    }

    function _mintToken(
        uint256 accountId,
        uint256 amount,
        uint256 epochId,
        uint256 tokenType
    ) internal {
        // TODO check if account is valid
        // TODO check msg.sender is approved by the account
        // TODO check if account is not paused
        // TODO check if epoch is valid
        // TODO check if epoch is not over and can mint
        // TODO check if can mint that amount
        // TODO mint amount of gas token
        // TODO transfer amount of gas token to msg.sender
        // TODO adjust balances
    }

    function _burnToken(
        uint256 accountId,
        uint256 amount,
        uint256 epochId,
        uint256 tokenType
    ) internal {
        // TODO check if account is valid
        // TODO check msg.sender is approved by the account
        // TODO check if account is not paused
        // TODO check if epoch is valid
        // TODO check if can burn that amount
        // TODO transfer amount of gas token from msg.sender
        // TODO burn amount of gas token
        // TODO adjust balances
    }
}
