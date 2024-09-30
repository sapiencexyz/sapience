// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "@perimetersec/fuzzlib/src/FuzzBase.sol";
import "./helper/FuzzStorageVariables.sol";

contract FuzzSetup is FuzzBase, FuzzStorageVariables {
    function setupFoil() internal {
        router = new MockRouter();
        vm.label(address(router), "Router");
        foil = address(new Proxy(address(router), address(this)));
        vm.label(address(foil), "Foil");

        weth = new WETH();
        usdc = new MockERC20("USDC", "USDC", 6);
        wstETH = new MockERC20("wstETH", "wstETH", 18);

        deployUniswapV3();
        deployImplementations();
        deployUniQuoter();

        addEpochConfigurationModuleSels();
        addEpochLiquidityModuleSels();
        addEpochTradeModuleSels();
        addEpochUMASettlementModuleSels();
        addEpochSettlementModuleSels();
        addEpochViewsModuleSels();
        addMockLensModuleSels();

        setupActors();
    }

    function deployImplementations() internal {
        epochConfigurationModuleImpl = new EpochConfigurationModule(USER1);
        epochERC165ModuleImpl = new EpochERC165Module();
        epochLiquidityModuleImpl = new EpochLiquidityModule();
        epochNftModuleImpl = new EpochNftModule();
        epochTradeModuleImpl = new EpochTradeModule();
        epochUMASettlementModuleImpl = new EpochUMASettlementModule();
        epochSettlementModuleImpl = new EpochSettlementModule();
        epochViewsModuleImpl = new EpochViewsModule();

        uma = new MockUMA();
        lens = new MockLensModule();
    }

    function addEpochConfigurationModuleSels() private {
        (bool success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochConfigurationModuleImpl.initializeMarket.selector,
                address(epochConfigurationModuleImpl)
            )
        );
        assert(success);

        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochConfigurationModuleImpl.updateMarket.selector,
                address(epochConfigurationModuleImpl)
            )
        );
        assert(success);

        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochConfigurationModuleImpl.createEpoch.selector,
                address(epochConfigurationModuleImpl)
            )
        );
        assert(success);
    }

    function addEpochLiquidityModuleSels() private {
        (bool success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochLiquidityModuleImpl.createLiquidityPosition.selector,
                address(epochLiquidityModuleImpl)
            )
        );
        assert(success);

        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochLiquidityModuleImpl.decreaseLiquidityPosition.selector,
                address(epochLiquidityModuleImpl)
            )
        );
        assert(success);

        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochLiquidityModuleImpl.increaseLiquidityPosition.selector,
                address(epochLiquidityModuleImpl)
            )
        );
        assert(success);

        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochLiquidityModuleImpl.getTokenAmounts.selector,
                address(epochLiquidityModuleImpl)
            )
        );
        assert(success);
    }

    function addEpochNftModuleSels() private {
        (bool success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochNftModuleImpl.balanceOf.selector,
                address(epochNftModuleImpl)
            )
        );
        assert(success);

        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochNftModuleImpl.ownerOf.selector,
                address(epochNftModuleImpl)
            )
        );
        assert(success);

        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochNftModuleImpl.name.selector,
                address(epochNftModuleImpl)
            )
        );
        assert(success);

        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochNftModuleImpl.symbol.selector,
                address(epochNftModuleImpl)
            )
        );
        assert(success);

        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochNftModuleImpl.tokenURI.selector,
                address(epochNftModuleImpl)
            )
        );
        assert(success);

        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochNftModuleImpl.approve.selector,
                address(epochNftModuleImpl)
            )
        );
        assert(success);

        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochNftModuleImpl.getApproved.selector,
                address(epochNftModuleImpl)
            )
        );
        assert(success);

        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochNftModuleImpl.setApprovalForAll.selector,
                address(epochNftModuleImpl)
            )
        );
        assert(success);

        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochNftModuleImpl.isApprovedForAll.selector,
                address(epochNftModuleImpl)
            )
        );
        assert(success);

        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochNftModuleImpl.transferFrom.selector,
                address(epochNftModuleImpl)
            )
        );
        assert(success);

        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochNftModuleImpl.tokenOfOwnerByIndex.selector,
                address(epochNftModuleImpl)
            )
        );
        assert(success);

        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochNftModuleImpl.totalSupply.selector,
                address(epochNftModuleImpl)
            )
        );
        assert(success);

        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochNftModuleImpl.tokenByIndex.selector,
                address(epochNftModuleImpl)
            )
        );
        assert(success);
    }

    function addEpochTradeModuleSels() private {
        (bool success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochTradeModuleImpl.createTraderPosition.selector,
                address(epochTradeModuleImpl)
            )
        );
        assert(success);

        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochTradeModuleImpl.modifyTraderPosition.selector,
                address(epochTradeModuleImpl)
            )
        );
        assert(success);

        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochTradeModuleImpl.quoteCreateTraderPosition.selector,
                address(epochTradeModuleImpl)
            )
        );
        assert(success);

        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochTradeModuleImpl.quoteModifyTraderPosition.selector,
                address(epochTradeModuleImpl)
            )
        );
        assert(success);
    }

    function addEpochUMASettlementModuleSels() private {
        (bool success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochUMASettlementModuleImpl.submitSettlementPrice.selector,
                address(epochUMASettlementModuleImpl)
            )
        );
        assert(success);

        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochUMASettlementModuleImpl.assertionResolvedCallback.selector,
                address(epochUMASettlementModuleImpl)
            )
        );
        assert(success);

        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochUMASettlementModuleImpl.assertionDisputedCallback.selector,
                address(epochUMASettlementModuleImpl)
            )
        );
        assert(success);
    }
    function addEpochSettlementModuleSels() private {
        (bool success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochSettlementModuleImpl.settlePosition.selector,
                address(epochSettlementModuleImpl)
            )
        );
        assert(success);
    }
    function addEpochViewsModuleSels() private {
        (bool success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochViewsModuleImpl.getMarket.selector,
                address(epochViewsModuleImpl)
            )
        );
        assert(success);

        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochViewsModuleImpl.getEpoch.selector,
                address(epochViewsModuleImpl)
            )
        );
        assert(success);

        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochViewsModuleImpl.getLatestEpoch.selector,
                address(epochViewsModuleImpl)
            )
        );
        assert(success);

        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                epochViewsModuleImpl.getPosition.selector,
                address(epochViewsModuleImpl)
            )
        );
        assert(success);
    }

    function addMockLensModuleSels() private {
        (bool success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                lens.getPositionLiquidity.selector,
                address(lens)
            )
        );
        assert(success);

        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                lens.getEthToGas.selector,
                address(lens)
            )
        );

        assert(success);

        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                lens.getCurrentPrice.selector,
                address(lens)
            )
        );
        assert(success);
        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                lens.getMarketOwner.selector,
                address(lens)
            )
        );
        assert(success);
        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                lens.getCurrentEpochTicks.selector,
                address(lens)
            )
        );
        assert(success);
        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                lens.getAmount0ForLiquidity_Foil.selector,
                address(lens)
            )
        );
        assert(success);
        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                lens.getCurrentEpochSqrtPriceX96MaxMin.selector,
                address(lens)
            )
        );
        assert(success);
        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                lens.getPositionOwner.selector,
                address(lens)
            )
        );
        assert(success);
        (success, ) = foil.call(
            abi.encodeWithSelector(
                router.addFunctionAndImplementation.selector,
                lens.getSettlementPrice.selector,
                address(lens)
            )
        );
        assert(success);
    }

    function deployUniswapV3() internal {
        deployUniV3();
        deployPositionManager();
    }

    function deployUniV3() internal {
        _uniV3Factory = new UniswapV3Factory();
        _v3SwapRouter = new SwapRouter(address(_uniV3Factory), address(weth));
    }

    function deployPositionManager() internal {
        _positionManager = new NonfungiblePositionManager(
            address(_uniV3Factory),
            address(weth)
        );
    }
    function deployUniQuoter() internal {
        _quoter = new Quoter(address(_uniV3Factory), address(weth));
    }

    function setupActors() internal {
        for (uint8 i = 0; i < USERS.length; i++) {
            address user = USERS[i];
            (bool success, ) = address(user).call{value: INITIAL_BALANCE}("");
            assert(success);

            vm.prank(user);
            weth.deposit{value: INITIAL_BALANCE / 2}();

            vm.prank(user);
            usdc.approve(address(uma), type(uint256).max);

            vm.prank(user);
            usdc.approve(address(foil), type(uint256).max);

            vm.prank(user);
            weth.approve(address(foil), type(uint256).max);

            usdc.mint(user, 1_000_000_000_000e6);

            wstETH.mint(user, INITIAL_BALANCE);
            vm.prank(user);
            wstETH.approve(address(foil), type(uint256).max);
        }
        usdc.mint(address(this), 1_000_000e6);
    }
}
