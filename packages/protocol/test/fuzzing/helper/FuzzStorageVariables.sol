// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../util/FuzzConstants.sol";

import {MockRouter} from "../mocks/MockRouter.sol";
import {Proxy} from "../Proxy.sol";

import {ConfigurationModule as EpochConfigurationModule} from "../../../src/contracts/modules/ConfigurationModule.sol";
import {ERC165Module as EpochERC165Module} from "../../../src/contracts/modules/ERC165Module.sol";
import {LiquidityModule as EpochLiquidityModule} from "../../../src/contracts/modules/LiquidityModule.sol";
import {NftModule as EpochNftModule} from "../../../src/contracts/modules/NftModule.sol";
import {TradeModule as EpochTradeModule} from "../../../src/contracts/modules/TradeModule.sol";
import {UMASettlementModule as EpochUMASettlementModule} from "../../../src/contracts/modules/UMASettlementModule.sol";
import {SettlementModule as EpochSettlementModule} from "../../../src/contracts/modules/SettlementModule.sol";
import {ViewsModule as EpochViewsModule} from "../../../src/contracts/modules/ViewsModule.sol";

import {UniswapV3Factory} from "../../../uniswapv3/v3-core/UniswapV3Factory.sol";
import {UniswapV3Pool} from "../../../uniswapv3/v3-core/UniswapV3Pool.sol";
import {SwapRouter} from "../../../uniswapv3/v3-periphery/SwapRouter.sol";
import {NonfungiblePositionManager} from "../../../uniswapv3/v3-periphery/NonfungiblePositionManager.sol";
import {Quoter} from "../../../uniswapv3/v3-periphery/lens/Quoter.sol";
import {WETH9 as WETH} from "../mocks/WETH.sol";

import {MockUMA} from "../mocks/MockUMA.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockLensModule} from "../mocks/MockLensModule.sol";

contract FuzzStorageVariables is FuzzConstants, Test {
    //foundry mode
    bool REPRO_MODE = true;

    //Foil vars
    int24 CURRENT_MAX_TICK;
    int24 CURRENT_MIN_TICK;

    mapping(uint => mapping(address => uint[])) internal userLiquidityPositions; // epochId => user => positions
    mapping(uint => mapping(address => uint[])) internal userTradePositions; // epochId => user => positions

    mapping(uint => bytes32[]) internal userAssertions;

    // Echidna settings
    address internal currentActor;
    bool internal _setActor = true;

    UniswapV3Factory internal _uniV3Factory;
    UniswapV3Pool internal _uniV3Pool;
    SwapRouter internal _v3SwapRouter;
    NonfungiblePositionManager internal _positionManager;
    Quoter internal _quoter;

    MockRouter internal router;
    address internal foil;

    WETH internal weth;
    MockERC20 internal usdc;
    MockERC20 internal wstETH;

    EpochConfigurationModule internal epochConfigurationModuleImpl;
    EpochERC165Module internal epochERC165ModuleImpl;
    EpochLiquidityModule internal epochLiquidityModuleImpl;
    EpochNftModule internal epochNftModuleImpl;
    EpochTradeModule internal epochTradeModuleImpl;
    EpochUMASettlementModule internal epochUMASettlementModuleImpl;
    EpochSettlementModule internal epochSettlementModuleImpl;
    EpochViewsModule internal epochViewsModuleImpl;

    MockUMA internal uma;

    MockLensModule internal lens;
}
