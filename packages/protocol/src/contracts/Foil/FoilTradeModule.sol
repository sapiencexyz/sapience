// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../storage/Epoch.sol";
import "../../storage/Account.sol";
import "../../storage/Position.sol";
import "../../storage/ERC721Storage.sol";
import "../../storage/ERC721EnumerableStorage.sol";

import "forge-std/console2.sol";

contract FoilTradeModule is ReentrancyGuard {
    using Epoch for Epoch.Data;
    using Account for Account.Data;
    using Position for Position.Data;
    using ERC721Storage for ERC721Storage.Data;

    function createTraderPosition(uint collateral, int size) external {
        uint accountId = ERC721EnumerableStorage.totalSupply() + 1;
        Account.createValid(accountId);
        ERC721Storage._mint(msg.sender, accountId);

        // Create empty position
        Position.load(accountId).accountId = accountId;
    }

    function updateTraderPosition(
        uint256 tokenId,
        uint collateral,
        int size
    ) external {
        return;
    }

    /*

    function openLong(uint256 accountId, uint256 collateralAmount) external {
        uint tokenId = accountId;
        require(ownerOf(tokenId) == msg.sender, "Not NFT owner");
        // check within time range
        Account.Data storage account = Account.loadValid(accountId);
        Epoch.Data storage epoch = Epoch.load();

        // IERC20(epoch.collateralAsset).transferFrom(
        //     msg.sender,
        //     address(this),
        //     collateralAmount
        // );

        Position.load(accountId).openLong(collateralAmount);
    }

    function reduceLong(uint256 accountId, uint256 vGasAmount) external {
        uint tokenId = accountId;
        require(ownerOf(tokenId) == msg.sender, "Not NFT owner");
        Position.Data storage position = Position.loadValid(accountId);

        Position.load(accountId).reduceLong(vGasAmount);
    }

    function openShort(uint256 accountId, uint256 collateralAmount) external {
        uint tokenId = accountId;
        require(ownerOf(tokenId) == msg.sender, "Not NFT owner");
        // check within time range
        Account.Data storage account = Account.loadValid(accountId);
        Epoch.Data storage epoch = Epoch.load();

        // IERC20(epoch.collateralAsset).transferFrom(
        //     msg.sender,
        //     address(this),
        //     collateralAmount
        // );

        Position.load(accountId).openShort(collateralAmount);
    }

    function reduceShort(uint256 accountId, uint256 vEthAmount) external {
        uint tokenId = accountId;
        require(ownerOf(tokenId) == msg.sender, "Not NFT owner");
        Position.Data storage position = Position.loadValid(accountId);

        Position.load(accountId).reduceShort(vEthAmount);
    }

*/
}
