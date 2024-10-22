// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import "forge-std/Test.sol";
import "cannon-std/Cannon.sol";
import {IFoil} from "../../src/market/interfaces/IFoil.sol";
import {IVault} from "../../src/vault/interfaces/IVault.sol";

import {IMintableToken} from "../../src/market/external/IMintableToken.sol";
import {TickMath} from "../../src/market/external/univ3/TickMath.sol";
import {TestTrade} from "../helpers/TestTrade.sol";
import {TestEpoch} from "../helpers/TestEpoch.sol";
import {TestUser} from "../helpers/TestUser.sol";
import {DecimalPrice} from "../../src/market/libraries/DecimalPrice.sol";
import "@synthetixio/core-contracts/contracts/utils/DecimalMath.sol";
import {SafeCastI256, SafeCastU256} from "@synthetixio/core-contracts/contracts/utils/SafeCast.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {Errors} from "../../src/market/storage/Errors.sol";
import {Position} from "../../src/market/storage/Position.sol";
import {IFoilStructs} from "../../src/market/interfaces/IFoilStructs.sol";
import {MigrationMathUtils} from "../../src/market/external/univ3/MigrationMathUtils.sol";
import "@synthetixio/core-contracts/contracts/utils/DecimalMath.sol";

contract VaultTest is TestTrade {
    using Cannon for Vm;
    using DecimalMath for uint256;
    using DecimalMath for int256;
    using SafeCastI256 for int256;
    using SafeCastU256 for uint256;

    address owner;
    IFoil foil;
    IVault vault;
    IMintableToken collateralAsset;
    IMintableToken bondCurrency;

    // address lp1;
    // address trader1;
    // uint256 epochId;
    // address pool;
    // address tokenA;
    // address tokenB;
    // IUniswapV3Pool uniCastedPool;
    // uint256 feeRate;
    // uint256 COLLATERAL_FOR_ORDERS = 100 ether;
    // uint256 INITIAL_PRICE_D18 = 5 ether;
    // uint256 INITIAL_PRICE_PLUS_FEE_D18 = 5.05 ether;
    // uint256 INITIAL_PRICE_LESS_FEE_D18 = 4.95 ether;
    // uint160 INITIAL_PRICE_SQRT = 177159557114295718903631839232; // 5.0
    // int24 EPOCH_LOWER_TICK = 6800; // 2.0
    // int24 EPOCH_UPPER_TICK = 27000; // 15.0
    // int24 LP_LOWER_TICK = 15800; //3.31
    // int24 LP_UPPER_TICK = 16200; //3.52
    // uint256 SETTLEMENT_PRICE_D18 = 10 ether;
    // uint160 SETTLEMENT_PRICE_SQRT_D18 = 250541448375047946302209916928; // 10.0

    // address optimisticOracleV3;
    // uint256 endTime;
    // uint256 minPriceD18;
    // uint256 maxPriceD18;
    // IFoilStructs.EpochParams epochParams;

    function setUp() public {
        address[] memory feeCollectors = new address[](0);

        (foil, vault, collateralAsset, owner) = initializeVault(feeCollectors);

        // uint160 startingSqrtPriceX96 = INITIAL_PRICE_SQRT;

        // (foil, ) = createEpoch(5200, 28200, startingSqrtPriceX96); // 1.709 to 17.09 (1.6819839204636384 to 16.774485460620674)

        // lp1 = TestUser.createUser("LP1", 20_000_000 ether);
        // trader1 = TestUser.createUser("Trader1", 20_000_000 ether);

        // (epochId, , , pool, tokenA, tokenB, , , , , ) = foil.getLatestEpoch();

        // uniCastedPool = IUniswapV3Pool(pool);
        // feeRate = uint256(uniCastedPool.fee()) * 1e12;

        // vm.startPrank(lp1);
        // addLiquidity(
        //     foil,
        //     pool,
        //     epochId,
        //     COLLATERAL_FOR_ORDERS * 100_000,
        //     LP_LOWER_TICK,
        //     LP_UPPER_TICK
        // ); // enough to keep price stable (no slippage)
        // vm.stopPrank();

        // // Settle the epoch
        // bondCurrency = IMintableToken(vm.getAddress("BondCurrency.Token"));
        // optimisticOracleV3 = vm.getAddress("UMA.OptimisticOracleV3");

        // (owner, , , , ) = foil.getMarket();
        // (
        //     epochId,
        //     ,
        //     endTime,
        //     ,
        //     ,
        //     ,
        //     minPriceD18,
        //     maxPriceD18,
        //     ,
        //     ,
        //     epochParams
        // ) = foil.getLatestEpoch();

        // bondCurrency.mint(epochParams.bondAmount * 2, owner);
    }

    function initializeVault(
        address[] memory feeCollectors
    )
        public
        returns (
            IFoil foilContract,
            IVault vaultContract,
            IMintableToken collateralAssetContract,
            address ownerUser
        )
    {
        ownerUser = createUser("Owner", 10_000_000 ether);
        foilContract = IFoil(vm.getAddress("Foil"));
        vaultContract = IVault(vm.getAddress("Vault"));
        collateralAssetContract = IMintableToken(
            vm.getAddress("CollateralAsset.Token")
        );

        // params (should move from initializeMarket to createEpoch)
        int24 minTick = 16000;
        int24 maxTick = 30000;

        vm.startPrank(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266);
        // Initialize Market (by owner, links fail market with vault)
        foilContract.initializeMarket(
            address(vaultContract),
            address(collateralAssetContract),
            feeCollectors,
            address(vaultContract),
            IFoilStructs.EpochParams({
                baseAssetMinPriceTick: minTick,
                baseAssetMaxPriceTick: maxTick,
                feeRate: 10000,
                assertionLiveness: 21600,
                bondCurrency: vm.getAddress("BondCurrency.Token"),
                bondAmount: BOND_AMOUNT,
                priceUnit: "wstGwei/gas",
                uniswapPositionManager: vm.getAddress(
                    "Uniswap.NonfungiblePositionManager"
                ),
                uniswapSwapRouter: vm.getAddress("Uniswap.SwapRouter"),
                uniswapQuoter: vm.getAddress("Uniswap.QuoterV2"),
                optimisticOracleV3: vm.getAddress("UMA.OptimisticOracleV3")
            })
        );

        // Initialize Epoch (by owner, kicks the ball with the first epoch)
        uint160 initialSqrtPriceX96 = 146497135921788803112962621440; // 3.419
        uint256 initialStartTime = block.timestamp + 60;
        vaultContract.initializeFirstEpoch(
            initialStartTime,
            initialSqrtPriceX96
        );

        vm.stopPrank();
    }

    function testSomethingFail() public {
        // make it fail so that we have logs
        assert(false);
    }

    function testSomethingSucceed() public {
        // make it pass so that we have a green mark
        assert(true);
    }
}
