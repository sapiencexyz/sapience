// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IFoilStructs} from "../../src/market/interfaces/IFoilStructs.sol";
import {Position} from "../../src/market/storage/Position.sol";
import {Vault} from "../../src/vault/Vault.sol";
import {TestVault} from "../helpers/TestVault.sol";
import {IFoil} from "../../src/market/interfaces/IFoil.sol";
import {IVault} from "../../src/vault/interfaces/IVault.sol";

contract VaultDurationTest is TestVault {
    using Cannon for Vm;

    IFoil foil1;
    IFoil foil2;
    IFoil foil3;

    uint160 initialSqrtPriceX96 = 250541448375047946302209916928; // 10
    uint160 settleSqrtPriceX96 = 250541448375047946302209916928; // 10

    uint256 initialStartTime;
    uint256 constant duration = 2419200;

    IVault vault1;
    IVault vault2;
    IVault vault3;

    uint256 constant totalVaults = 3;

    function _createVault(
        string memory name,
        string memory symbol,
        IFoil foil,
        uint256 vaultIndex
    ) internal returns (IVault vault) {
        vm.startPrank(vaultOwner);
        vault = IVault(
            new Vault(
                name,
                symbol,
                address(foil),
                vm.getAddress("CollateralAsset.Token"),
                577350269189625700, //sqrt(1/3)
                1732050807568877200, //sqrt(3)
                duration,
                vaultIndex,
                totalVaults,
                vaultOwner
            )
        );
        vm.stopPrank();

        initializeMarketWithVault(
            foil,
            address(vault),
            new address[](0),
            10_000,
            100 ether
        );
    }

    function setUp() public {
        foil1 = IFoil(vm.getAddress("Foil"));
        foil2 = IFoil(vm.getAddress("Foil2"));
        foil3 = IFoil(vm.getAddress("Foil3"));

        vault1 = _createVault("Vault 1", "VLT1", foil1, 0);
        vault2 = _createVault("Vault 2", "VLT2", foil2, 1);
        vault3 = _createVault("Vault 3", "VLT3", foil3, 2);

        vm.startPrank(vaultOwner);
        vm.warp(block.timestamp);
        initialStartTime = block.timestamp + 1 days;
        vault1.initializeFirstEpoch(initialSqrtPriceX96, initialStartTime);
        vault2.initializeFirstEpoch(initialSqrtPriceX96, initialStartTime);
        vault3.initializeFirstEpoch(initialSqrtPriceX96, initialStartTime);
        vm.stopPrank();
    }

    function test_epochStartTimesAreStaggered() public view {
        // First vault should start at current block timestamp
        assertEq(
            vault1.getCurrentEpoch().startTime,
            initialStartTime,
            "Vault 1 start time incorrect"
        );

        // Second vault should start duration/3 after first
        assertEq(
            vault2.getCurrentEpoch().startTime,
            initialStartTime + duration,
            "Vault 2 start time incorrect"
        );

        // Third vault should start 2*duration/3 after first
        assertEq(
            vault3.getCurrentEpoch().startTime,
            initialStartTime + (duration * 2),
            "Vault 3 start time incorrect"
        );
    }

    function test_epochSettlementExceedsVaultsDuration_setsNextEpochStartTime()
        public
    {
        vm.warp(initialStartTime + (duration * 3) + 1);
        settleEpochWithFoil(
            foil1,
            vault1.getCurrentEpoch().epochId,
            settleSqrtPriceX96,
            address(vault1)
        );

        assertEq(
            vault1.getCurrentEpoch().startTime,
            initialStartTime + (duration * 3 * 2),
            "Vault 1 start time incorrect"
        );
    }

    function test_epochSettlementExceedsVaultsDuration_setsNextEpochStartTime_multipleVaults()
        public
    {
        // Settle vault 1
        vm.warp(initialStartTime + duration + 1);
        settleEpochWithFoil(
            foil1,
            vault1.getCurrentEpoch().epochId,
            settleSqrtPriceX96,
            address(vault1)
        );

        assertEq(
            vault1.getCurrentEpoch().startTime,
            initialStartTime + (duration * 3),
            "Vault 1 start time incorrect"
        );

        // Make vault 2 settle after it's next epoch time
        vm.warp(initialStartTime + (duration * 4) + 1);
        settleEpochWithFoil(
            foil2,
            vault2.getCurrentEpoch().epochId,
            settleSqrtPriceX96,
            address(vault2)
        );

        assertEq(
            vault2.getCurrentEpoch().startTime,
            initialStartTime + (duration * 7),
            "Vault 2 start time incorrect"
        );

        // settle vault 3 around the same time, which should set start time to the right duration
        settleEpochWithFoil(
            foil3,
            vault3.getCurrentEpoch().epochId,
            settleSqrtPriceX96,
            address(vault3)
        );

        assertEq(
            vault3.getCurrentEpoch().startTime,
            initialStartTime + (duration * 5),
            "Vault 3 start time incorrect"
        );
    }
}
