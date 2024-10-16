

contract Vault is IERC20 {

    
    constructor(uint initialPrice, address collateralAddress, uint startTime, ) IERC20("Vault", "VAULT") {

    /*
        == Constructor Params ==
        uniswapPositionManager =  "<%= imports.Uniswap.contracts.NonfungiblePositionManager.address %>", 
        uniswapSwapRouter = "<%= imports.Uniswap.contracts.SwapRouter.address %>", 
        uniswapQuoter = "<%= imports.Uniswap.contracts.QuoterV2.address %>", 
        optimisticOracleV3 = "<%= imports.UMA.contracts.OptimisticOracleV3.address %>" }
        priceUnit = "<%= formatBytes32String('wstGwei/gas') %>"

        == Initializer Params ==

        collateralAsset
        startTime = "<%= parseInt(timestamp) %>"
        duration
        startingSqrtPriceX96 = "146497135921788803112962621440" # 3.419
        feeRate = "10000" # 1%
        assertionLiveness = "21600" # 6 hours
        bondCurrency = address
        bondAmount = "5000000000"
    */
    //DEPLOY MARKET
    // Call _initializer
    }

    _initializer() private {
        market.createEpoch()
    }

    function handleSuccessSettlementCallback(uint256 previousSettlementPriceD18) external onlyMarket {
        _createNextEpoch(previoustSettlementPriceD18);
    }

    function _createNextEpoch(uint256 previousSettlementPriceD18) private {
        _initializer();
        // Process Withdraw queue
        // Initialize next epoch
        // Process Deposit queue
    }

}   
    