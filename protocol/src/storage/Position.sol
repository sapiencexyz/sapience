// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0;

import "./Epoch.sol";
import "./Account.sol";
import "../utils/UniV3Abstraction.sol";

library Position {
    struct Data {
        uint160 accountId;
        uint256 vEthAmount;
        uint256 vGasAmount;
    }

    function load(
        uint160 accountId
    ) internal pure returns (Data storage position) {
        bytes32 s = keccak256(abi.encode("foil.gas.position", accountId));

        assembly {
            position.slot := s
        }
    }

    function loadValid(
        uint160 accountId
    ) internal view returns (Data storage position) {
        Account.loadValid(accountId);
        position = load(accountId);
    }

    function openLong(Data storage self, uint256 collateralAmount) internal {
        Epoch.Data storage epoch = Epoch.load();

        UniV3Abstraction.swap(
            self.accountId,
            address(epoch.pool),
            true,
            true,
            collateralAmount,
            type(uint160).max,
            true
        );
    }

    function reduceLong(Data storage self, uint256 vGasAmount) internal {
        Epoch.Data storage epoch = Epoch.load();

        // vGas -> vwstETH

        UniV3Abstraction.swap(
            self.accountId,
            address(epoch.pool),
            true,
            false,
            vGasAmount,
            type(uint160).max,
            false
        );
    }

    function openShort(Data storage self, uint256 collateralAmount) internal {
        Epoch.Data storage epoch = Epoch.load();

        /*
            wstETH -> vGas -> uniswap -> vwstETH
        */

        UniV3Abstraction.swap(
            self.accountId,
            address(epoch.pool),
            false,
            true,
            collateralAmount,
            type(uint160).max,
            true
        );
    }

    function reduceShort(Data storage self, uint256 vEthAmount) internal {
        Epoch.Data storage epoch = Epoch.load();

        /*
            vEth -> vGas
        */

        UniV3Abstraction.swap(
            self.accountId,
            address(epoch.pool),
            true,
            true,
            vEthAmount,
            type(uint160).max,
            false
        );
    }

    function updateBalance(
        Data storage self,
        int256 amount0Delta,
        int256 amount1Delta
    ) internal {
        if (amount0Delta < 0) {
            self.vEthAmount += uint256(amount0Delta * -1);
        } else {
            self.vGasAmount += uint256(amount1Delta * -1);
        }
    }
}
