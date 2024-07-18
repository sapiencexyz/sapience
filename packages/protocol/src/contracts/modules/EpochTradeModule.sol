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
        if (amountInVEth > 0 && amountInVGas > 0) {
            revert("Only one token can be traded at a time");
        }

        if (amountInVEth == 0 && amountInVGas == 0) {
            revert("At least one token should be traded");
        }

        Epoch.Data storage epoch = Epoch.load();
        epoch.validateSettlmentState();

        if (epoch.settled) {
            (amountOutVEth, amountOutVGas) = _afterSettlementSwapExactIn(
                epoch,
                amountInVEth,
                amountInVGas
            );
        } else {
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

            // TODO amountOutMinimum and sqrtPriceLimitX96 should be passed as param to prevent slippage
            // TODO -- Naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
            // TODO -- We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
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
            uint256 amountOut = epoch.uniswapSwapRouter.exactInputSingle(
                params
            );

            if (amountInVEth > 0) {
                amountOutVGas = amountOut;
            } else {
                amountOutVEth = amountOut;
            }
        }
    }

    function swapTokensExactOut(
        uint256 availableAmountInVEth,
        uint256 availableAmountInVGas,
        uint256 expectedAmountOutVEth,
        uint256 expectedAmountOutVGas
    )
        internal
        returns (
            uint256 refundAmountVEth,
            uint256 refundAmountVGas,
            uint256 tokenAmountVEth,
            uint256 tokenAmountVGas
        )
    {
        if (expectedAmountOutVEth > 0 && expectedAmountOutVGas > 0) {
            revert("Only one token can be traded at a time");
        }

        if (expectedAmountOutVEth == 0 && expectedAmountOutVGas == 0) {
            revert("At least one token should be traded");
        }

        Epoch.Data storage epoch = Epoch.load();
        epoch.validateSettlmentState();

        if (epoch.settled) {
            uint consumedAmountInVEth;
            uint consumedAmountInVGas;
            (
                consumedAmountInVEth,
                consumedAmountInVGas,
                tokenAmountVEth,
                tokenAmountVGas
            ) = _afterSettlementSwapExactOut(
                epoch,
                expectedAmountOutVEth,
                expectedAmountOutVGas
            );
            refundAmountVEth = availableAmountInVEth - consumedAmountInVEth;
            refundAmountVGas = availableAmountInVGas - consumedAmountInVGas;
        } else {
            address tokenIn;
            address tokenOut;
            uint256 amountOut;

            if (expectedAmountOutVEth > 0) {
                tokenIn = address(epoch.ethToken);
                tokenOut = address(epoch.gasToken);
                amountOut = expectedAmountOutVEth;
            } else {
                tokenIn = address(epoch.gasToken);
                tokenOut = address(epoch.ethToken);
                amountOut = expectedAmountOutVGas;
            }

            // TODO amountInMaximum and sqrtPriceLimitX96 should be passed as param to prevent slippage
            // TODO -- Naively set amountInMaximum to maxUint . In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
            // TODO -- We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
            ISwapRouter.ExactOutputSingleParams memory params = ISwapRouter
                .ExactOutputSingleParams({
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    fee: epoch.feeRate,
                    recipient: address(this),
                    deadline: block.timestamp,
                    amountOut: amountOut,
                    amountInMaximum: type(uint256).max,
                    sqrtPriceLimitX96: 0
                });

            uint256 amountIn = epoch.uniswapSwapRouter.exactOutputSingle(
                params
            );

            if (expectedAmountOutVEth > 0) {
                refundAmountVGas = availableAmountInVGas - amountIn;
            } else {
                refundAmountVEth = availableAmountInVEth - amountIn;
            }
        }
    }

    function _afterSettlementSwapExactIn(
        Epoch.Data storage epoch,
        uint256 amountInVEth,
        uint256 amountInVGas
    ) internal view returns (uint256 amountOutVEth, uint256 amountOutVGas) {
        console2.log("_afterSettlementSwapExactIn");

        if (amountInVEth > 0) {
            amountOutVEth = 0;
            amountOutVGas = amountInVEth.divDecimal(epoch.settlementPrice);
        } else {
            amountOutVEth = amountInVGas.mulDecimal(epoch.settlementPrice);
            amountOutVGas = 0;
        }
    }

    function _afterSettlementSwapExactOut(
        Epoch.Data storage epoch,
        uint256 amountOutVEth,
        uint256 amountOutVGas
    )
        internal
        view
        returns (
            uint256 consumedAmountInVEth,
            uint256 consumedAmountInVGas,
            uint256 tokenOutVEth,
            uint256 tokenOutVGas
        )
    {
        console2.log("_afterSettlementSwapExactIn");

        if (amountOutVGas > 0) {
            tokenOutVEth = 0;
            tokenOutVGas = amountOutVGas;
            consumedAmountInVEth = amountOutVGas.mulDecimal(
                epoch.settlementPrice
            );
            consumedAmountInVGas = 0;
        } else {
            tokenOutVEth = amountOutVEth;
            tokenOutVGas = 0;
            consumedAmountInVEth = 0;
            consumedAmountInVGas = amountOutVEth.divDecimal(
                epoch.settlementPrice
            );
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

    function getReferencePrice() public view returns (uint256) {
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
}
