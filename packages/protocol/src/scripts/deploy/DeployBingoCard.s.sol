// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Script, console } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { BingoCard } from "../../bingo/BingoCard.sol";
import { StaticEntropy } from "../../bingo/StaticEntropy.sol";

/// @title Deploy + configure BingoCard on Ethereal testnet (staging)
/// @notice Deploys StaticEntropy + BingoCard, wires the escrow + config
///         defaults, and seeds the condition pool — so the only manual step
///         left is depositing the bonus pool (if BONUS_DEPOSIT_WEI is unset).
///
/// Required env:
///   - PM_NETWORK_DEPLOYER_PRIVATE_KEY  signer key (becomes owner)
///   - PM_NETWORK_DEPLOYER_ADDRESS      deployer EOA (also the owner)
///
/// Optional env (testnet defaults):
///   - COLLATERAL_TOKEN_ADDRESS  wUSDe; defaults to Ethereal testnet collateral.
///   - ESCROW_ADDRESS            PredictionMarketEscrow; defaults to testnet.
///   - ENTROPY_FEE_WEI           StaticEntropy fee, default 1 wei.
///   - ENTROPY_RANDOM            bytes32 fixed random, default 0x4242…42.
///   - MIN_CARD_PRICE_WEI        Floor card price, default 1e18 ($1).
///   - REFERRAL_BPS              Referrer cut in bps, default 200 (2%).
///   - CARD_EXPIRY_SECONDS       Time until withdrawUnused, default 30 days.
///   - BONUS_DEPOSIT_WEI         If > 0, approve + deposit into the bonus pool
///                               from the deployer (needs wUSDe). Default 0.
contract DeployBingoCard is Script {
    // ---- Ethereal testnet (chain 13374202) defaults ----
    address constant TESTNET_ESCROW =
        0x72bAf4704650CA327d22BFc84ed1E45a0fB4fd14;
    address constant TESTNET_COLLATERAL =
        0xb7AE43711D85C23Dc862C85B9C95A64DC6351F90;

    function run() external {
        address deployer = vm.envAddress("PM_NETWORK_DEPLOYER_ADDRESS");
        address collateral =
            vm.envOr("COLLATERAL_TOKEN_ADDRESS", TESTNET_COLLATERAL);

        vm.startBroadcast(vm.envUint("PM_NETWORK_DEPLOYER_PRIVATE_KEY"));

        StaticEntropy entropy = new StaticEntropy(deployer);
        entropy.setFee(uint128(vm.envOr("ENTROPY_FEE_WEI", uint256(1))));
        entropy.setRandom(
            vm.envOr(
                "ENTROPY_RANDOM",
                bytes32(
                    uint256(
                        0x4242424242424242424242424242424242424242424242424242424242424242
                    )
                )
            )
        );

        BingoCard bingo =
            new BingoCard(collateral, address(entropy), deployer, deployer);

        _configure(bingo, collateral);

        vm.stopBroadcast();

        console.log("=== Deployed + configured (Ethereal testnet) ===");
        console.log("StaticEntropy:", address(entropy));
        console.log("BingoCard:    ", address(bingo));
        console.log("Pool size:    ", bingo.poolSize());
        console.log("");
        console.log("Next:");
        console.log("  1. Paste the BingoCard address into Settings (gear)");
        console.log("  2. If bonus pool is 0, /admin -> Deposit bonus pool");
        console.log(
            "  Reveals: /admin -> Pending reveals -> Push (StaticEntropy)"
        );
    }

    /// @dev Applies all owner config in its own stack frame (the broadcast set
    ///      by `run` still applies to these external calls).
    function _configure(BingoCard bingo, address collateral) internal {
        bingo.setEscrow(vm.envOr("ESCROW_ADDRESS", TESTNET_ESCROW));
        bingo.setMinCardPrice(vm.envOr("MIN_CARD_PRICE_WEI", uint256(1e18)));
        bingo.setReferralBps(uint16(vm.envOr("REFERRAL_BPS", uint256(200))));
        bingo.setCardExpiry(
            uint64(vm.envOr("CARD_EXPIRY_SECONDS", uint256(30 days)))
        );
        bingo.setMultipliers(_multipliers());

        (bytes32[] memory ids, address[] memory resolvers) = _stagingPool();
        bingo.setPool(ids, resolvers);

        uint256 bonus = vm.envOr("BONUS_DEPOSIT_WEI", uint256(0));
        if (bonus > 0) {
            IERC20(collateral).approve(address(bingo), bonus);
            bingo.depositBonus(bonus);
        }
    }

    /// @dev Bonus multiplier curve (bps; 10_000 = 1x), by winning-line count.
    ///      0–1 bingos pay nothing; 9 (not in the spec table) interpolated.
    function _multipliers() internal pure returns (uint32[11] memory m) {
        m = [
            uint32(0), //        0 bingos → no bonus
            0, //                1        → no bonus
            20_000, //           2        → 2x
            30_000, //           3        → 3x
            40_000, //           4        → 4x
            50_000, //           5        → 5x
            100_000, //          6        → 10x
            250_000, //          7        → 25x
            500_000, //          8        → 50x
            750_000, //          9        → 75x (interpolated; not in spec)
            1_000_000 //        10        → 100x
        ];
    }

    /// @dev Staging condition pool from staging.sapience.xyz. 22 conditions on
    ///      resolver A (the testnet ManualConditionResolver). The 2 conditions
    ///      that were on resolver B were dropped: that resolver (the
    ///      ConditionalTokens resolver) is only deployed on Ethereal *mainnet*,
    ///      not testnet (no code at the address on chain 13374202), so any line
    ///      drawing one of those cells would revert in escrow `_validatePicks`.
    ///      22 >= the 16-cell minimum.
    function _stagingPool()
        internal
        pure
        returns (bytes32[] memory ids, address[] memory resolvers)
    {
        address rA =
            vm.parseAddress("0x7e81ca51de1eecc5ed4f7ecbaa3156400c6b3b9c");

        ids = new bytes32[](22);
        resolvers = new address[](22);

        ids[0] =
        0xfe6b62eb04131454b02250536badc72dbb7050dec35a8a4fe224691789aa49a4;
        ids[1] =
        0xe4c35f0be9e047259312dea22f17b619e7b4af73f013b91ccfa82d929c2b337e;
        ids[2] =
        0xf352cca74e6854574467bbeaad2c2335b47200caf2e671925b735a879d564d24;
        ids[3] =
        0x293ed83ff451fbfd454eb09985f6707c5c33a30cf79ba98bf45ccf2fa553438f;
        ids[4] =
        0x7061e7ce4d7744677b6c3a7d1db0f82eb90c342104167386619d75777a6083c1;
        ids[5] =
        0xb3e5963c18d0fbe9285a35e65aa260b304a3cded6aaddab9507122caa33caf44;
        ids[6] =
        0x0a4b9beb6128863db2b107f185521597a426356f1d9a23c7001401edfd32014b;
        ids[7] =
        0x4cd77d456c83e7d8c569a8fb8f6396c3f40154f657e6d970733e2b1b6a7110ff;
        ids[8] =
        0x17dfc75726fa95d4054d91e80295c8b3e494569617e67a7e620e27562b7952b0;
        ids[9] =
        0x3150ba668d15e1c248c71bcff71c67f1adf87063db7047f27f15ebbc9a1a6a0d;
        ids[10] =
        0xa6c938b3402538af5faa626dc882bd7995db132df1c4ea669db7841df3557678;
        ids[11] =
        0x8f92746709a4fc82f4d454e162046ac3590e3a5a7564540806a6c5f8a87e6738;
        ids[12] =
        0x51fc7cfdaee135d6d0bed053e5fcd3652954414d9b9f4eef5dce2e9ea717f161;
        ids[13] =
        0x2153377bdb8920a0d3227e9a2a68ddb9a001025918b695fe55f66677836e62c6;
        ids[14] =
        0x6bb8b2483eccb8fcae84cd42fd7d8e5e394689e0a06f95b189a77b4819cf0173;
        ids[15] =
        0x151f00b091b2e346656190b49c06644920fdba4f1280f7976e7f5f6bdfec7bb3;
        ids[16] =
        0x114ba3133f9949f6a34f75caf515b6eb43eecf19a71958fdb0950f4bd94cf10e;
        ids[17] =
        0x6f78fd69fd6dafb695a8f4074dac11971b1da612bd150aa0c837efbd86417292;
        ids[18] =
        0xf18497fa69a4ca7a92e13814bb332c3c68052d7cd4345970be683d4042a109b7;
        ids[19] =
        0x6c0b425903eab2fd17e3171fedb3fe557497de75a2da23dd2db21f2624e9b20a;
        ids[20] =
        0xe3e8574f967e628750dff67c641944a84da281ced40ffe7c76e42649e89a6887;
        ids[21] =
        0x4cf389adc069a4d713e1ddb6348c96afd6df78e6bf676c7dce1780135186d90e;

        for (uint256 i = 0; i < 22; i++) {
            resolvers[i] = rA;
        }
    }
}
