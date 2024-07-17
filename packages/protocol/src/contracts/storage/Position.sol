// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

import "./Epoch.sol";
import "./Account.sol";
import "./Debt.sol";
import "../utils/UniV3Abstraction.sol";
import {SafeCastU256} from "../../synthetix/utils/SafeCast.sol";

library Position {
    using SafeCastU256 for uint256;

    struct Data {
        uint256 accountId;
        uint256 vEthAmount;
        uint256 vGasAmount;
        int256 currentTokenAmount;
    }

    function load(
        uint256 accountId
    ) internal pure returns (Data storage position) {
        bytes32 s = keccak256(abi.encode("foil.gas.position", accountId));

        assembly {
            position.slot := s
        }
    }

    function loadValid(
        uint256 accountId
    ) internal view returns (Data storage position) {
        Account.loadValid(accountId);
        position = load(accountId);
    }

    /*
    function openLong(Data storage self, uint256 collateralAmount) internal {
        Epoch.Data storage epoch = Epoch.load();

        //
        //  vEth -> vGas
        //

        UniV3Abstraction.RuntimeSwapParameters memory params = UniV3Abstraction
            .RuntimeSwapParameters({
                accountId: self.accountId,
                pool: address(epoch.pool),
                amountIsInput: true,
                isVEthToVGas: true,
                amount: collateralAmount,
                sqrtPriceLimitX96: 0,
                shouldMint: true
            });

        UniV3Abstraction.swap(params);
    }

    function reduceLong(Data storage self, uint256 vGasAmount) internal {
        Epoch.Data storage epoch = Epoch.load();

        //
        //  vGas -> vwstETH
        //

        UniV3Abstraction.RuntimeSwapParameters memory params = UniV3Abstraction
            .RuntimeSwapParameters({
                accountId: self.accountId,
                pool: address(epoch.pool),
                amountIsInput: true,
                isVEthToVGas: false,
                amount: vGasAmount,
                sqrtPriceLimitX96: 0,
                shouldMint: false
            });

        UniV3Abstraction.swap(params);
    }

    function openShort(Data storage self, uint256 collateralAmount) internal {
        Epoch.Data storage epoch = Epoch.load();

        //
        //  wstETH -> vGas -> uniswap -> vwstETH
        //

        UniV3Abstraction.RuntimeSwapParameters memory params = UniV3Abstraction
            .RuntimeSwapParameters({
                accountId: self.accountId,
                pool: address(epoch.pool),
                amountIsInput: false,
                isVEthToVGas: true,
                amount: collateralAmount,
                sqrtPriceLimitX96: 0,
                shouldMint: true
            });

        UniV3Abstraction.swap(params);
    }

    function reduceShort(Data storage self, uint256 vEthAmount) internal {
        Epoch.Data storage epoch = Epoch.load();

        //
        //  vEth -> vGas
        //

        UniV3Abstraction.RuntimeSwapParameters memory params = UniV3Abstraction
            .RuntimeSwapParameters({
                accountId: self.accountId,
                pool: address(epoch.pool),
                amountIsInput: true,
                isVEthToVGas: true,
                amount: vEthAmount,
                sqrtPriceLimitX96: 0,
                shouldMint: true // TODO Should be false, but tests were failing... need to understand
            });

        UniV3Abstraction.swap(params);
    }

    */

    function updateBalance(
        Data storage self,
        int256 deltaTokenAmount,
        int256 vEthDeltaAmount,
        int256 vGasDeltaAmount
    ) internal {
        self.currentTokenAmount += deltaTokenAmount;
        self.vEthAmount = uint256(self.vEthAmount.toInt() + vEthDeltaAmount);
        self.vGasAmount = uint256(self.vGasAmount.toInt() + vGasDeltaAmount);
    }
}
