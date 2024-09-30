// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "@perimetersec/fuzzlib/src/FuzzBase.sol";
import "../helper/FuzzStorageVariables.sol";
import "../../../src/contracts/interfaces/IFoilStructs.sol";

contract FunctionCalls is FuzzBase, FuzzStorageVariables {
    event InitializeMarketCall(
        address owner,
        address collateralAsset,
        address uniswapPositionManager,
        address uniswapSwapRouter,
        address optimisticOracleV3
    );
    event UpdateMarketCall(
        address owner,
        address uniswapPositionManager,
        address uniswapSwapRouter,
        address optimisticOracleV3
    );
    event CreateEpochCall(
        uint256 startTime,
        uint256 endTime,
        uint160 startingSqrtPriceX96
    );

    event OnERC721ReceivedCall(
        address operator,
        address from,
        uint256 tokenId,
        bytes data
    );
    event CollectFeesCall(uint256 epochId, uint256 tokenId);
    event DecreaseLiquidityPositionCall(
        uint256 positionId,
        uint256 collateralAmount,
        uint128 liquidity,
        uint256 minGasAmount,
        uint256 minEthAmount
    );
    event IncreaseLiquidityPositionCall(
        uint256 positionId,
        uint256 collateralAmount,
        uint256 gasTokenAmount,
        uint256 ethTokenAmount,
        uint256 minGasAmount,
        uint256 minEthAmount
    );
    event GetTokenAmountsCall(
        uint256 epochId,
        uint256 depositedCollateralAmount,
        uint160 sqrtPriceX96,
        uint160 sqrtPriceAX96,
        uint160 sqrtPriceBX96
    );
    event BalanceOfCall(address holder);
    event OwnerOfCall(uint256 tokenId);
    event NameCall();
    event SymbolCall();
    event TokenURICall(uint256 tokenId);
    event ApproveCall(address to, uint256 tokenId);
    event GetApprovedCall(uint256 tokenId);
    event SetApprovalForAllCall(address operator, bool approved);
    event IsApprovedForAllCall(address holder, address operator);
    event TransferFromCall(address from, address to, uint256 tokenId);
    event SafeTransferFromCall(address from, address to, uint256 tokenId);
    event SafeTransferFromWithDataCall(
        address from,
        address to,
        uint256 tokenId,
        bytes data
    );
    event TokenOfOwnerByIndexCall(address owner, uint256 index);
    event TotalSupplyCall();
    event TokenByIndexCall(uint256 index);

    event CreateTraderPositionCall(
        uint256 epochId,
        uint256 collateralAmount,
        int256 tokenAmount,
        int256 tokenAmountLimit
    );
    event ModifyTraderPositionCall(
        uint256 positionId,
        int collateralAmount,
        int256 tokenAmount,
        int256 tokenAmountLimit
    );
    event GetReferencePriceCall(uint256 epochId);
    event GetLongSizeForCollateralCall(uint256 epochId, uint256 collateral);
    event GetShortSizeForCollateralCall(uint256 epochId, uint256 collateral);
    event SubmitSettlementPriceCall(
        uint256 epochId,
        uint256 settlementPriceD18
    );
    event AssertionResolvedCallbackCall(
        bytes32 assertionId,
        bool assertedTruthfully
    );
    event AssertionDisputedCallbackCall(bytes32 assertionId);
    event GetMarketCall();
    event GetEpochCall(uint256 id);
    event GetLatestEpochCall();
    event GetPositionCall(uint256 positionId);
    event GetPositionLiquidityCall(uint256 positionId);
    event GetEthToGasCall(uint256 ethAmount, uint256 epochId);
    event GetCurrentPriceCall();
    event MockDisputeAssertionCall(bytes32 assertionId, address disputer);
    event MockSettleAssertionCall(
        bytes32 assertionId,
        bool settlementResolution
    );
    event GetMarketOwnerCall();
    event SettlePositionCall(uint postionId);
    event GetCurrentEpochTicksCall(uint epochId);
    event getAmount0ForLiquidity_Foil(
        uint160 sqrtRatioAX96,
        uint160 sqrtRatioBX96,
        uint128 liquidity
    );
    event GetCurrentEpochSqrtPriceX96MaxMinCal(uint epochId);
    event GetSettlementPriceCall(uint epochId);
    event QuoteCreateTraderPositionCall(uint epochId, int size);
    event QuoteModifyTraderPositionCall(uint positionId, int size);

    function _initializeMarketCall(
        address owner,
        address collateralAsset,
        IFoilStructs.EpochParams memory epochParams,
        address foilAddresss
    ) internal returns (bool success, bytes memory returnData) {
        emit InitializeMarketCall(
            owner,
            collateralAsset,
            address(0),
            address(0),
            address(0)
        );

        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                epochConfigurationModuleImpl.initializeMarket.selector,
                owner,
                collateralAsset,
                epochParams,
                foilAddresss
            )
        );
    }

    function _updateMarketCall(
        IFoilStructs.EpochParams memory epochParams
    ) internal returns (bool success, bytes memory returnData) {
        emit UpdateMarketCall(address(0), address(0), address(0), address(0));

        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                epochConfigurationModuleImpl.updateMarket.selector,
                epochParams
            )
        );
    }

    function _createEpochCall(
        uint256 startTime,
        uint256 endTime,
        uint160 startingSqrtPriceX96,
        uint256 salt
    ) internal returns (bool success, bytes memory returnData) {
        emit CreateEpochCall(startTime, endTime, startingSqrtPriceX96);

        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                epochConfigurationModuleImpl.createEpoch.selector,
                startTime,
                endTime,
                startingSqrtPriceX96,
                salt
            )
        );
    }

    function _createLiquidityPositionCall(
        IFoilStructs.LiquidityMintParams memory params
    ) internal returns (bool success, bytes memory returnData) {
        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                epochLiquidityModuleImpl.createLiquidityPosition.selector,
                params
            )
        );
    }

    function _decreaseLiquidityPositionCall(
        IFoilStructs.LiquidityDecreaseParams memory params
    ) internal returns (bool success, bytes memory returnData) {
        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                epochLiquidityModuleImpl.decreaseLiquidityPosition.selector,
                params
            )
        );
    }
    function _decreaseLiquidityPositionCallNOPRANK(
        IFoilStructs.LiquidityDecreaseParams memory params
    ) internal returns (bool success, bytes memory returnData) {
        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                epochLiquidityModuleImpl.decreaseLiquidityPosition.selector,
                params
            )
        );
    }
    function _increaseLiquidityPositionCall(
        IFoilStructs.LiquidityIncreaseParams memory params
    ) internal returns (bool success, bytes memory returnData) {
        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                epochLiquidityModuleImpl.increaseLiquidityPosition.selector,
                params
            )
        );
    }

    function _getTokenAmountsCall(
        uint256 epochId,
        uint256 depositedCollateralAmount,
        uint160 sqrtPriceX96,
        uint160 sqrtPriceAX96,
        uint160 sqrtPriceBX96
    ) internal returns (bool success, bytes memory returnData) {
        emit GetTokenAmountsCall(
            epochId,
            depositedCollateralAmount,
            sqrtPriceX96,
            sqrtPriceAX96,
            sqrtPriceBX96
        );

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                epochLiquidityModuleImpl.getTokenAmounts.selector,
                epochId,
                depositedCollateralAmount,
                sqrtPriceX96,
                sqrtPriceAX96,
                sqrtPriceBX96
            )
        );
    }

    function _balanceOfCall(
        address holder
    ) internal returns (bool success, bytes memory returnData) {
        emit BalanceOfCall(holder);

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                epochNftModuleImpl.balanceOf.selector,
                holder
            )
        );
    }

    function _ownerOfCall(
        uint256 tokenId
    ) internal returns (bool success, bytes memory returnData) {
        emit OwnerOfCall(tokenId);

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(epochNftModuleImpl.ownerOf.selector, tokenId)
        );
    }

    function _nameCall()
        internal
        returns (bool success, bytes memory returnData)
    {
        emit NameCall();

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(epochNftModuleImpl.name.selector)
        );
    }

    function _symbolCall()
        internal
        returns (bool success, bytes memory returnData)
    {
        emit SymbolCall();

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(epochNftModuleImpl.symbol.selector)
        );
    }

    function _tokenURICall(
        uint256 tokenId
    ) internal returns (bool success, bytes memory returnData) {
        emit TokenURICall(tokenId);

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                epochNftModuleImpl.tokenURI.selector,
                tokenId
            )
        );
    }

    function _approveCall(
        address to,
        uint256 tokenId
    ) internal returns (bool success, bytes memory returnData) {
        emit ApproveCall(to, tokenId);

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                epochNftModuleImpl.approve.selector,
                to,
                tokenId
            )
        );
    }

    function _getApprovedCall(
        uint256 tokenId
    ) internal returns (bool success, bytes memory returnData) {
        emit GetApprovedCall(tokenId);

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                epochNftModuleImpl.getApproved.selector,
                tokenId
            )
        );
    }

    function _setApprovalForAllCall(
        address operator,
        bool approved
    ) internal returns (bool success, bytes memory returnData) {
        emit SetApprovalForAllCall(operator, approved);

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                epochNftModuleImpl.setApprovalForAll.selector,
                operator,
                approved
            )
        );
    }

    function _isApprovedForAllCall(
        address holder,
        address operator
    ) internal returns (bool success, bytes memory returnData) {
        emit IsApprovedForAllCall(holder, operator);

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                epochNftModuleImpl.isApprovedForAll.selector,
                holder,
                operator
            )
        );
    }

    function _transferFromCall(
        address from,
        address to,
        uint256 tokenId
    ) internal returns (bool success, bytes memory returnData) {
        emit TransferFromCall(from, to, tokenId);

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                epochNftModuleImpl.transferFrom.selector,
                from,
                to,
                tokenId
            )
        );
    }

    function _tokenOfOwnerByIndexCall(
        address owner,
        uint256 index
    ) internal returns (bool success, bytes memory returnData) {
        emit TokenOfOwnerByIndexCall(owner, index);

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                epochNftModuleImpl.tokenOfOwnerByIndex.selector,
                owner,
                index
            )
        );
    }

    function _totalSupplyCall()
        internal
        returns (bool success, bytes memory returnData)
    {
        emit TotalSupplyCall();

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(epochNftModuleImpl.totalSupply.selector)
        );
    }

    function _tokenByIndexCall(
        uint256 index
    ) internal returns (bool success, bytes memory returnData) {
        emit TokenByIndexCall(index);

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                epochNftModuleImpl.tokenByIndex.selector,
                index
            )
        );
    }

    function _createTraderPositionCall(
        uint256 epochId,
        int256 tokenAmount,
        uint256 collateralAmount,
        uint256 deadline
    ) internal returns (bool success, bytes memory returnData) {
        emit CreateTraderPositionCall(
            epochId,
            collateralAmount,
            tokenAmount,
            0
        );

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                epochTradeModuleImpl.createTraderPosition.selector,
                epochId,
                tokenAmount,
                collateralAmount,
                deadline
            )
        );
    }

    function _modifyTraderPositionCall(
        uint256 positionId,
        int256 tokenAmount,
        int256 collateralAmount,
        uint256 deadline
    ) internal returns (bool success, bytes memory returnData) {
        emit ModifyTraderPositionCall(
            positionId,
            collateralAmount,
            tokenAmount,
            0
        );

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                epochTradeModuleImpl.modifyTraderPosition.selector,
                positionId,
                tokenAmount,
                collateralAmount,
                deadline
            )
        );
    }

    function _quoteCreateTraderPositionCall(
        uint256 epochId,
        int256 size
    ) internal returns (bool success, bytes memory returnData) {
        emit QuoteCreateTraderPositionCall(epochId, size);

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                epochTradeModuleImpl.quoteCreateTraderPosition.selector,
                epochId,
                size
            )
        );
    }

    function _quoteModifyTraderPositionCall(
        uint256 positionId,
        int256 size
    ) internal returns (bool success, bytes memory returnData) {
        emit QuoteModifyTraderPositionCall(positionId, size);

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                epochTradeModuleImpl.quoteModifyTraderPosition.selector,
                positionId,
                size
            )
        );
    }

    function _submitSettlementPriceCall(
        uint256 epochId,
        uint256 settlementPriceD18
    ) internal returns (bool success, bytes memory returnData) {
        emit SubmitSettlementPriceCall(epochId, settlementPriceD18);

        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                epochUMASettlementModuleImpl.submitSettlementPrice.selector,
                epochId,
                settlementPriceD18
            )
        );
    }

    function _assertionResolvedCallbackCall(
        bytes32 assertionId,
        bool assertedTruthfully
    ) internal returns (bool success, bytes memory returnData) {
        emit AssertionResolvedCallbackCall(assertionId, assertedTruthfully);

        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                epochUMASettlementModuleImpl.assertionResolvedCallback.selector,
                assertionId,
                assertedTruthfully
            )
        );
    }

    function _assertionDisputedCallbackCall(
        bytes32 assertionId
    ) internal returns (bool success, bytes memory returnData) {
        emit AssertionDisputedCallbackCall(assertionId);

        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                epochUMASettlementModuleImpl.assertionDisputedCallback.selector,
                assertionId
            )
        );
    }

    function _settlePositionCall(
        uint256 postionId
    ) internal returns (bool success, bytes memory returnData) {
        emit SettlePositionCall(postionId);
        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                epochSettlementModuleImpl.settlePosition.selector,
                postionId
            )
        );
    }

    function _getMarketCall()
        internal
        returns (bool success, bytes memory returnData)
    {
        emit GetMarketCall();

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(epochViewsModuleImpl.getMarket.selector)
        );
    }

    function _getEpochCall(
        uint256 id
    ) internal returns (bool success, bytes memory returnData) {
        emit GetEpochCall(id);

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(epochViewsModuleImpl.getEpoch.selector, id)
        );
    }

    function _getLatestEpochCall()
        internal
        returns (bool success, bytes memory returnData)
    {
        emit GetLatestEpochCall();

        (success, returnData) = foil.call(
            abi.encodeWithSelector(epochViewsModuleImpl.getLatestEpoch.selector)
        );
    }

    function _getPositionCall(
        uint256 positionId
    ) internal returns (bool success, bytes memory returnData) {
        emit GetPositionCall(positionId);

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                epochViewsModuleImpl.getPosition.selector,
                positionId
            )
        );
    }

    function _getPositionLiquidityCall(
        uint256 positionId
    ) internal returns (bool success, bytes memory returnData) {
        emit GetPositionLiquidityCall(positionId);

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                lens.getPositionLiquidity.selector,
                positionId
            )
        );
    }

    function _getPositionOwnerCall(
        uint256 positionId
    ) internal returns (bool success, bytes memory returnData) {
        emit GetPositionLiquidityCall(positionId);

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(lens.getPositionOwner.selector, positionId)
        );
    }
    function _getCurrentEpochSqrtPriceX96MaxMinCall(
        uint256 epochId
    ) internal returns (bool success, bytes memory returnData) {
        emit GetCurrentEpochSqrtPriceX96MaxMinCal(epochId);

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                lens.getCurrentEpochSqrtPriceX96MaxMin.selector,
                epochId
            )
        );
    }

    function _getEthToGasCall(
        uint256 ethAmount,
        uint256 epochId
    ) internal returns (bool success, bytes memory returnData) {
        emit GetEthToGasCall(ethAmount, epochId);

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                lens.getEthToGas.selector,
                ethAmount,
                epochId
            )
        );
    }

    function _getAmount0ForLiquidity_FoilCall(
        uint160 sqrtRatioAX96,
        uint160 sqrtRatioBX96,
        uint128 liquidity
    ) internal returns (bool success, bytes memory returnData) {
        emit getAmount0ForLiquidity_Foil(
            sqrtRatioAX96,
            sqrtRatioBX96,
            liquidity
        );

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(
                lens.getAmount0ForLiquidity_Foil.selector,
                sqrtRatioAX96,
                sqrtRatioBX96,
                liquidity
            )
        );
    }
    function _getCurrentEpochTicksCall(
        uint256 epochId
    ) internal returns (bool success, bytes memory returnData) {
        emit GetCurrentEpochTicksCall(epochId);

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(lens.getCurrentEpochTicks.selector, epochId)
        );
    }

    function _getCurrentPriceCall(
        uint epochId
    ) internal returns (bool success, bytes memory returnData) {
        emit GetCurrentPriceCall();

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(lens.getCurrentPrice.selector, epochId)
        );
    }
    function _getMarketOwnerCall()
        internal
        returns (bool success, bytes memory returnData)
    {
        emit GetMarketOwnerCall();

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(lens.getMarketOwner.selector)
        );
    }
    function _getSettlementPriceCall(
        uint epochId
    ) internal returns (bool success, bytes memory returnData) {
        emit GetSettlementPriceCall(epochId);

        vm.prank(currentActor);
        (success, returnData) = foil.call(
            abi.encodeWithSelector(lens.getSettlementPrice.selector, epochId)
        );
    }

    function _mockDisputeAssertionCall(
        bytes32 assertionId,
        address disputer
    ) internal returns (bool success, bytes memory returnData) {
        emit MockDisputeAssertionCall(assertionId, disputer);

        vm.prank(currentActor);

        (success, returnData) = address(uma).call(
            abi.encodeWithSelector(
                uma.mockDisputeAssertion.selector,
                assertionId,
                disputer
            )
        );
    }
    function _mockSettleAssertionCall(
        bytes32 assertionId,
        bool settlementResolution
    ) internal returns (bool success, bytes memory returnData) {
        emit MockSettleAssertionCall(assertionId, settlementResolution);

        vm.prank(currentActor);

        (success, returnData) = address(uma).call(
            abi.encodeWithSelector(
                uma.mockSettleAssertion.selector,
                assertionId,
                settlementResolution
            )
        );
    }
}
