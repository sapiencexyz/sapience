// contracts/GGFactory.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./VirtualToken.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";

// It should be a library and used from main contract, otherwise it should be limited to be called only by the main contract
contract GGFactory {
    struct Epoch {
        VirtualToken vGas;
        VirtualToken vEth;
        IUniswapV3Pool pool;
        uint256 startTime;
        uint256 endTime;
        bool isSettled;
        uint256 settlementPrice;
    }

    Epoch[] public epochs;
    IUniswapV3Factory public factory;

    // VirtualToken private vEth;

    constructor(IUniswapV3Factory _uniswapFactoryAddress) {
        //address _uniswapFactoryAddress = 0x1F98431c8aD98523631AE4a59f267346ea31F984
        factory = IUniswapV3Factory(_uniswapFactoryAddress);
        // vEth = new VirtualToken(address(this), "virtual ETH Token", "vETH");
    }

    function startEpoch(
        uint256 _startTime,
        uint256 _endTime,
        uint24 fee,
        address tokenOwner
    ) public onlyIfNotCurrentEpoch {
        //uint24 fee = 3000
        Epoch memory epoch;
        epoch.startTime = _startTime;
        epoch.endTime = _endTime;
        string memory epochId = integerToString(epochs.length);
        epoch.vGas = new VirtualToken(
            address(this),
            string.concat("virtual Gas Token - ", epochId),
            string.concat("vGT", epochId)
        );
        epoch.vGas.mint(tokenOwner, type(uint256).max);

        // is it necessary to create both virtual tokens every time?
        epoch.vEth = new VirtualToken(
            address(this),
            string.concat("virtual ETH Token - ", epochId),
            string.concat("vETH", epochId)
        );
        epoch.vEth.mint(tokenOwner, type(uint256).max);
        // epoch.vEth = vEth;
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
