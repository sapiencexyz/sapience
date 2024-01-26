// contracts/MyNFT.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./GasToken.sol";
import "./GasWeiToken.sol";
import "./GGNFT.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";

contract GGMain {
    struct Epoch {
        GasToken gasToken;
        GasWeiToken gasWeiToken;
        IUniswapV3Pool pool;
        uint256 startTime;
        uint256 endTime;
    }

    Epoch[] public epochs;
    IUniswapV3Factory public factory;
    GGNFT public ggNft;

    constructor(IUniswapV3Factory _uniswapFactoryAddress, GGNFT _ggNft) {
        //address _uniswapFactoryAddress = 0x1F98431c8aD98523631AE4a59f267346ea31F984
        factory = IUniswapV3Factory(_uniswapFactoryAddress);
        ggNft = GGNFT(_ggNft);
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
        epoch.gasToken = new GasToken(address(this));
        epoch.gasWeiToken = new GasWeiToken(address(this));
        epoch.pool = IUniswapV3Pool(
            factory.createPool(
                address(epoch.gasToken),
                address(epoch.gasWeiToken),
                fee
            )
        );
        epochs.push(epoch);
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
