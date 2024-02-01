// contracts/GGFactory.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./VirtualGasToken.sol";
import "./VirtualEthToken.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";

contract GGFactory {
    struct Epoch {
        VirtualGasToken vGas;
        VirtualEthToken vEth;
        IUniswapV3Pool pool;
        uint256 startTime;
        uint256 endTime;
    }

    Epoch[] public epochs;
    IUniswapV3Factory public factory;

    constructor(IUniswapV3Factory _uniswapFactoryAddress) {
        //address _uniswapFactoryAddress = 0x1F98431c8aD98523631AE4a59f267346ea31F984
        factory = IUniswapV3Factory(_uniswapFactoryAddress);
    }

    function startEpoch(
        uint256 _startTime,
        uint256 _endTime,
        uint24 fee
    ) public onlyIfNotCurrentEpoch {
        //uint24 fee = 3000
        Epoch memory epoch;
        epoch.startTime = _startTime;
        epoch.endTime = _endTime;
        epoch.vGas = new VirtualGasToken(
            address(this),
            integerToString(epochs.length)
        );
        epoch.vEth = new VirtualEthToken(
            address(this),
            integerToString(epochs.length)
        );
        epoch.pool = IUniswapV3Pool(
            factory.createPool(address(epoch.vGas), address(epoch.vEth), fee)
        );
        epochs.push(epoch);
    }

    function integerToString(uint _i) internal pure returns (string memory) {
        if (_i == 0) {
            return "0";
        }
        uint j = _i;
        uint len;

        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        uint k = len - 1;

        while (_i != 0) {
            bstr[k--] = bytes1(uint8(48 + (_i % 10)));
            _i /= 10;
        }
        return string(bstr);
    }

    modifier onlyIfNotCurrentEpoch() {
        require(
            epochs.length == 0 ||
                epochs[epochs.length - 1].endTime < block.timestamp,
            "GGMain: Current epoch is not over yet"
        );
        _;
    }
}
