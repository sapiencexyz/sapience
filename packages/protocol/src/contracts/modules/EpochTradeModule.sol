// SPDX-License-Identifier: MIT
pragma solidity >=0.8.25 <0.9.0;

import "../storage/Account.sol";
import "../storage/Position.sol";
import "../storage/ERC721Storage.sol";
import "../storage/ERC721EnumerableStorage.sol";
import "../../synthetix/utils/DecimalMath.sol";
import {SafeCastI256} from "../../synthetix/utils/SafeCast.sol";
import {SafeCastU256} from "../../synthetix/utils/SafeCast.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

import "forge-std/console2.sol";

contract EpochTradeModule {
    using Epoch for Epoch.Data;
    using Position for Position.Data;
    using DecimalMath for uint256;
    using SafeCastI256 for int256;
    using SafeCastU256 for uint256;

    uint256 private constant _COLLATERAL_TO_VGWEI = 1e9;

    function createTraderPosition(
        uint256 collateralAmount,
        int256 tokenAmount
    ) external returns (uint256 accountId) {
        // create/load account
        Epoch.Data storage epoch = Epoch.load();
        // check if epoch is not settled
        epoch.validateNotSettled();

        accountId = ERC721EnumerableStorage.totalSupply() + 1;

        Account.Data storage account = Account.createValid(accountId);
        ERC721Storage._mint(msg.sender, accountId);

        // Create empty position
        Position.Data storage position = Position.load(accountId);
        position.accountId = accountId;

        if (tokenAmount > 0) {
            _createLongPosition(
                account,
                position,
                collateralAmount,
                tokenAmount
            );
        } else {
            _createShortPosition(
                account,
                position,
                collateralAmount,
                tokenAmount
            );
        }
    }

    function modifyTraderPosition(
        uint256 accountId,
        uint256 collateralAmount,
        int256 deltaTokenAmount
    ) external {
        // identify the account and position
        // Notice: accountId is the tokenId
        require(
            ERC721Storage._ownerOf(accountId) == msg.sender,
            "Not NFT owner"
        );
        Account.Data storage account = Account.loadValid(accountId);
        Position.Data storage position = Position.loadValid(accountId);

        (bool sameSide, int expectedTokenAmount) = sameSideAndExpected(
            position.currentTokenAmount,
            deltaTokenAmount
        );

        if (!sameSide || expectedTokenAmount == 0) {
            // go to zero before moving to the other side
            _closePosition(account, position, collateralAmount);
        }

        if (expectedTokenAmount > 0) {
            _modifyLongPosition(
                account,
                position,
                collateralAmount,
                expectedTokenAmount
            );
        } else if (expectedTokenAmount < 0) {
            _modifyShortPosition(
                account,
                position,
                collateralAmount,
                expectedTokenAmount
            );
        }
    }

    function _createLongPosition(
        Account.Data storage account,
        Position.Data storage position,
        uint256 collateralAmount,
        int256 tokenAmount
    ) internal {
        // with the collateral get vEth (Loan)
        uint vEthLoan = collateralAmount * _COLLATERAL_TO_VGWEI; // 1:1e9

        account.collateralAmount += collateralAmount;
        account.borrowedGwei += vEthLoan;

        // with the vEth get vGas (Swap)
        (
            uint256 refundAmountVEth,
            uint256 refundAmountVGas,
            uint256 tokenAmountVEth,
            uint256 tokenAmountVGas
        ) = swapTokensExactOut(vEthLoan, 0, 0, tokenAmount.toUint());
        account.borrowedGwei -= refundAmountVEth;

        position.updateBalance(
            tokenAmountVEth.toInt(),
            tokenAmountVGas.toInt(),
            tokenAmount
        );
    }

    function _createShortPosition(
        Account.Data storage account,
        Position.Data storage position,
        uint256 collateralAmount,
        int256 tokenAmount
    ) internal {
        // with the collateral get vGas (Loan)
        uint vGasLoan = collateralAmount *
            _COLLATERAL_TO_VGWEI *
            getReferencePrice(); // 1:1e9:currentPrice

        account.collateralAmount += collateralAmount;
        account.borrowedGas += vGasLoan;

        // with the vGas get vEth (Swap)
        (uint256 tokenAmountVEth, uint256 tokenAmountVGas) = swapTokensExactIn(
            0,
            tokenAmount.toUint()
        );

        position.updateBalance(
            tokenAmountVEth.toInt(),
            tokenAmountVGas.toInt(),
            tokenAmount
        );
    }

    function _modifyLongPosition(
        Account.Data storage account,
        Position.Data storage position,
        uint256 collateralAmount,
        int256 tokenAmount
    ) internal {
        if (tokenAmount > position.currentTokenAmount) {
            // Increase the position (LONG)
            uint delta = (tokenAmount - position.currentTokenAmount).toUint();
            // with the collateral get vEth (Loan)
            uint vEthLoan = collateralAmount * _COLLATERAL_TO_VGWEI; // 1:1e9
            account.collateralAmount += collateralAmount;
            account.borrowedGwei += vEthLoan;

            // with the vEth get vGas (Swap)
            (
                uint256 refundAmountVEth,
                uint256 refundAmountVGas,
                uint256 tokenAmountVEth,
                uint256 tokenAmountVGas
            ) = swapTokensExactOut(vEthLoan, 0, 0, delta);
            account.borrowedGwei -= refundAmountVEth;

            position.updateBalance(
                tokenAmountVEth.toInt(),
                tokenAmountVGas.toInt(),
                delta.toInt()
            );
        } else {
            // Decrease the position (LONG)
            if (collateralAmount > 0) {
                console2.log("IT SHULD REVERT WITH UNEXPECTED COLLATERAL");
                return;
            }

            uint delta = (position.currentTokenAmount - tokenAmount).toUint();

            // with the vGas get vEth (Swap)
            (
                uint256 tokenAmountVEth,
                uint256 tokenAmountVGas
            ) = swapTokensExactIn(0, delta);

            position.updateBalance(
                tokenAmountVEth.toInt(),
                tokenAmountVGas.toInt(),
                tokenAmount
            );
        }
    }

    function _modifyShortPosition(
        Account.Data storage account,
        Position.Data storage position,
        uint256 collateralAmount,
        int256 tokenAmount
    ) internal {
        if (tokenAmount < position.currentTokenAmount) {
            // Increase the position (SHORT)

            uint delta = (position.currentTokenAmount - tokenAmount).toUint();
            // with the collateral get vGas (Loan)
            uint vGasLoan = collateralAmount *
                _COLLATERAL_TO_VGWEI *
                getReferencePrice(); // 1:1e9:currentPrice
            account.collateralAmount += collateralAmount;
            account.borrowedGas += vGasLoan;

            // with the vGas get vEth (Swap)
            (
                uint256 tokenAmountVEth,
                uint256 tokenAmountVGas
            ) = swapTokensExactIn(0, delta);

            position.updateBalance(
                tokenAmountVEth.toInt(),
                tokenAmountVGas.toInt(),
                tokenAmount
            );
        } else {
            // Decrease the position (SHORT)
            if (collateralAmount > 0) {
                console2.log("IT SHULD REVERT WITH UNEXPECTED COLLATERAL");
                return;
            }

            uint delta = (tokenAmount - position.currentTokenAmount).toUint();

            // with the vEth get vGas (Swap)
            (
                uint256 refundAmountVEth,
                uint256 refundAmountVGas,
                uint256 tokenAmountVEth,
                uint256 tokenAmountVGas
            ) = swapTokensExactOut(position.vEthAmount, 0, 0, delta);
            account.borrowedGas -= tokenAmountVGas;

            position.updateBalance(
                (position.vEthAmount - refundAmountVEth).toInt(),
                0,
                tokenAmount
            );
        }
    }

    function _closePosition(
        Account.Data storage account,
        Position.Data storage position,
        uint256 collateralAmount
    ) internal {
        // TODO (autogenerated by copilot): Implement the close position logic
        if (position.currentTokenAmount > 0) {
            // Close LONG position
            // with the vGas get vEth (Swap)
            (
                uint256 refundAmountVEth,
                uint256 refundAmountVGas,
                uint256 tokenAmountVEth,
                uint256 tokenAmountVGas
            ) = swapTokensExactOut(
                    position.vEthAmount,
                    0,
                    0,
                    position.currentTokenAmount.toUint()
                );
            account.borrowedGwei -= refundAmountVEth;

            position.updateBalance(
                tokenAmountVEth.toInt(),
                tokenAmountVGas.toInt(),
                position.currentTokenAmount
            );
        } else {
            // Close SHORT position
            // with the vEth get vGas (Swap)
            (
                uint256 refundAmountVEth,
                uint256 refundAmountVGas,
                uint256 tokenAmountVEth,
                uint256 tokenAmountVGas
            ) = swapTokensExactOut(
                    position.vEthAmount,
                    0,
                    0,
                    position.currentTokenAmount.toUint()
                );
            account.borrowedGas -= refundAmountVGas;

            position.updateBalance(
                tokenAmountVEth.toInt(),
                tokenAmountVGas.toInt(),
                position.currentTokenAmount
            );
        }
    }

    function swapTokensExactIn(
        uint256 amountInVEth,
        uint256 amountInVGas
    ) internal returns (uint256 amountOutVEth, uint256 amountOutVGas) {
        // TODO (autogenerated by copilot): Implement the close position logic
        if (amountInVEth > 0 && amountInVGas > 0) {
            revert("Only one token can be traded at a time");
        }

        Epoch.Data storage epoch = Epoch.load();
        epoch.validateSettlmentState();

        if (epoch.settled) {
            return _afterSettlementSwap(epoch, amountInVEth, amountInVGas);
        }

        return _preSettlementSwap(epoch, amountInVEth, amountInVGas);
    }

    function swapTokensExactOut(
        uint256 amountInVEth,
        uint256 amountInVGas,
        uint256 amountOutVEth,
        uint256 amountOutVGas
    ) internal returns (uint256, uint256, uint256, uint256) {
        // TODO (autogenerated by copilot): Implement the close position logic
        if (amountInVEth > 0 && amountInVGas > 0) {
            revert("Only one token can be traded at a time");
        }

        // Epoch.Data storage epoch = Epoch.load();
        // epoch.validateSettlmentState();

        // if (epoch.settled) {
        //     return
        //         _afterSettlementSwap(
        //             epoch,
        //             amountInVEth,
        //             amountInVGas,
        //             amountOutVEth,
        //             amountOutVGas
        //         );
        // }

        // return
        //     _preSettlementSwap(
        //         epoch,
        //         amountInVEth,
        //         amountInVGas,
        //         amountOutVEth,
        //         amountOutVGas
        //     );
    }

    function swapTokens(
        uint256 amountInVEth,
        uint256 amountInVGas
    ) internal returns (uint256 amountOutVEth, uint256 amountOutVGas) {
        if (amountInVEth > 0 && amountInVGas > 0) {
            revert("Only one token can be traded at a time");
        }

        Epoch.Data storage epoch = Epoch.load();
        epoch.validateSettlmentState();

        if (epoch.settled) {
            return _afterSettlementSwap(epoch, amountInVEth, amountInVGas);
        }

        return _preSettlementSwap(epoch, amountInVEth, amountInVGas);
    }

    function _afterSettlementSwap(
        Epoch.Data storage epoch,
        uint256 amountInVEth,
        uint256 amountInVGas
    ) internal returns (uint256 amountOutVEth, uint256 amountOutVGas) {
        console2.log("_afterSettlementSwap");

        if (amountInVEth > 0) {
            amountOutVEth = 0;
            amountOutVGas = amountInVEth.divDecimal(epoch.settlementPrice);
        } else {
            amountOutVEth = amountInVGas.mulDecimal(epoch.settlementPrice);
            amountOutVGas = 0;
        }
    }

    function _preSettlementSwap(
        Epoch.Data storage epoch,
        uint256 amountInVEth,
        uint256 amountInVGas
    ) internal returns (uint256 amountOutVEth, uint256 amountOutVGas) {
        console2.log("_preSettlementSwap");

        address tokenIn;
        address tokenOut;
        uint256 amountIn;

        if (amountInVEth > 0) {
            tokenIn = address(epoch.ethToken);
            tokenOut = address(epoch.gasToken);
            amountIn = amountInVEth;
        } else {
            tokenIn = address(epoch.gasToken);
            tokenOut = address(epoch.ethToken);
            amountIn = amountInVGas;
        }

        // Naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
        // We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: epoch.feeRate,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });
        uint256 amountOut = epoch.uniswapSwapRouter.exactInputSingle(params);

        if (amountInVEth > 0) {
            amountOutVGas = amountOut;
        } else {
            amountOutVEth = amountOut;
        }
    }

    function sameSideAndExpected(
        int tokenAmount,
        int deltaTokenAmount
    ) internal pure returns (bool sameSide, int expectedTokenAmount) {
        expectedTokenAmount = tokenAmount + deltaTokenAmount;
        if (tokenAmount > 0 && expectedTokenAmount > 0) {
            return (true, expectedTokenAmount);
        } else if (tokenAmount < 0 && deltaTokenAmount < 0) {
            return (true, expectedTokenAmount);
        } else {
            return (false, expectedTokenAmount);
        }
    }

    function getReferencePrice() internal view returns (uint256) {
        Epoch.Data storage epoch = Epoch.load();
        if (epoch.settled) {
            return epoch.settlementPrice;
        } else {
            (uint160 sqrtRatioX96, , , , , , ) = IUniswapV3Pool(epoch.pool)
                .slot0();
            return
                FullMath.mulDiv(sqrtRatioX96, sqrtRatioX96, FixedPoint96.Q96);
        }
    }

    /*
    function openLong(uint256 accountId, uint256 collateralAmount) external {
        // create/load account
        Epoch.Data storage epoch = Epoch.load();
        // check if epoch is not settled
        epoch.validateNotSettled();

        // identify the account and position
        // Notice: accountId is the tokenId
        require(
            ERC721Storage._ownerOf(accountId) == msg.sender,
            "Not NFT owner"
        );
        Account.Data storage account = Account.loadValid(accountId);
        Position.Data storage position = Position.loadValid(accountId);

        // with the collateral get vEth (Loan)
        uint vEthLoan = collateralAmount; // 1:1
        account.collateralAmount += collateralAmount;
        account.borrowedGwei += vEthLoan;

        // with the vEth get vGas (Swap)
        (uint256 amountOutVEth, uint256 amountOutVGas) = _preSettlementSwap(
            epoch,
            vEthLoan, // vEth to swap to vGas ()
            0
        );

        position.vEthAmount += amountOutVEth;
        position.vGasAmount += amountOutVGas;
    }

    function reduceLong(uint256 accountId, uint256 newVGasSize) external {
        Epoch.Data storage epoch = Epoch.load();

        // identify the account and position
        // Notice: accountId is the tokenId
        require(
            ERC721Storage._ownerOf(accountId) == msg.sender,
            "Not NFT owner"
        );
        Account.Data storage account = Account.loadValid(accountId);
        Position.Data storage position = Position.loadValid(accountId);

        // check size is less than the current size
        if (newVGasSize < position.vGasAmount) {
            console2.log(
                "IT SHOULD REVERT WITH NEW SIZE SHOULD BE LESS THAN CURRENT"
            );

            revert("New size is greater than current size");
        }
        uint reduction = position.vGasAmount - newVGasSize;

        epoch.validateSettlmentState();

        // with the vGas get vEth (Swap)
        uint swappedVGas;
        uint swappedVEth;
        if (epoch.settled) {
            (swappedVEth, swappedVGas) = _afterSettlementSwap(
                epoch,
                0,
                reduction
            );
        }

        (swappedVEth, swappedVGas) = _preSettlementSwap(epoch, 0, reduction);

        // with the vEth reduce the debt (Loan)
        position.vEthAmount += swappedVEth;
        uint debtReduction = swappedVEth > account.borrowedGwei
            ? account.borrowedGwei
            : swappedVEth;
        account.borrowedGwei -= debtReduction;
        position.vEthAmount -= debtReduction;
        position.vGasAmount -= reduction;
    }

    function openShort(uint256 accountId, uint256 collateralAmount) external {
        Epoch.Data storage epoch = Epoch.load();
        // check if epoch is not settled
        epoch.validateNotSettled();

        // identify the account and position
        // Notice: accountId is the tokenId
        require(
            ERC721Storage._ownerOf(accountId) == msg.sender,
            "Not NFT owner"
        );
        Account.Data storage account = Account.loadValid(accountId);
        Position.Data storage position = Position.loadValid(accountId);

        // with the collateral get vGas (Loan)
        uint vGasPrice = epoch.settlementPrice; // TODO: get the price from Uni
        uint vGasLoan = collateralAmount.divDecimal(vGasPrice); // 1:1
        account.collateralAmount += collateralAmount;
        account.borrowedGas += vGasLoan;

        // with the vEth get vGas (Swap)
        (uint256 amountOutVEth, uint256 amountOutVGas) = _preSettlementSwap(
            epoch,
            0,
            vGasLoan // with the vGas get vEth (Swap)
        );

        position.vEthAmount += amountOutVEth;
        position.vGasAmount += amountOutVGas;
    }

    function reduceShort(uint256 accountId, uint256 newVEthSize) external {
        Epoch.Data storage epoch = Epoch.load();

        // identify the account and position
        // Notice: accountId is the tokenId
        require(
            ERC721Storage._ownerOf(accountId) == msg.sender,
            "Not NFT owner"
        );
        Account.Data storage account = Account.loadValid(accountId);
        Position.Data storage position = Position.loadValid(accountId);

        // check size is less than the current size
        if (newVEthSize < position.vEthAmount) {
            console2.log(
                "IT SHOULD REVERT WITH NEW SIZE SHOULD BE LESS THAN CURRENT"
            );

            revert("New size is greater than current size");
        }
        uint reduction = position.vEthAmount - newVEthSize;

        epoch.validateSettlmentState();

        // with vEth get vGas (Swap)
        uint swappedVGas;
        uint swappedVEth;
        if (epoch.settled) {
            (swappedVEth, swappedVGas) = _afterSettlementSwap(
                epoch,
                reduction,
                0
            );
        }

        (swappedVEth, swappedVGas) = _preSettlementSwap(epoch, reduction, 0);

        // with the vGas reduce the debt (Loan)
        position.vGasAmount += swappedVGas;
        uint debtReduction = swappedVGas > account.borrowedGas
            ? account.borrowedGas
            : swappedVGas;
        account.borrowedGas -= debtReduction;
        position.vGasAmount -= debtReduction;
        position.vEthAmount -= reduction;
    }

    function payDebtAndBurnVtokens() external {
        // check if epoch is settled
        // identify the account
        // use available vGas to pay the debt
        // if still vGas debt and enough available vEth => use vEth, swap to vGas to pay the rest of debt
        // if still vGas debt or vEth debt and not enough vEth => use collateral to get vEth
        // swap vEth to vGas to pay the rest of vGas debt
        // swap the rest of vGas to vEth
        // pay the rest of vEth debt
        // transform the rest of vEth to Collateral
    }

    */
}
