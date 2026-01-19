// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {PositionTokenBridge} from "../../../v2/bridge/PositionTokenBridge.sol";
import {PositionTokenBridgeRemote} from "../../../v2/bridge/PositionTokenBridgeRemote.sol";
import {PositionTokenFactory} from "../../../v2/bridge/PositionTokenFactory.sol";
import {IPositionTokenBridgeBase} from "../../../v2/bridge/interfaces/IPositionTokenBridgeBase.sol";

/// @title Check Status
/// @notice Check the status of all bridge contracts and pending bridges
/// @dev Run with --rpc-url for each chain to check status
contract CheckStatus is Script {
    function run() external view {
        // Try to read all addresses from env
        address etherealBridge = vm.envOr("ETHEREAL_BRIDGE_ADDRESS", address(0));
        address arbBridge = vm.envOr("ARB_BRIDGE_ADDRESS", address(0));
        address factory = vm.envOr("FACTORY_ADDRESS", address(0));
        address testToken = vm.envOr("TEST_TOKEN_ADDRESS", address(0));
        address deployer = vm.envOr("DEPLOYER_ADDRESS", address(0));

        console.log("=== V2 Bridge Status Check ===");
        console.log("");

        // Check Ethereal Bridge
        if (etherealBridge != address(0)) {
            console.log("--- Ethereal Bridge ---");
            console.log("Address:", etherealBridge);

            try PositionTokenBridge(payable(etherealBridge)).isConfigComplete() returns (bool complete) {
                console.log("Config complete:", complete);

                IPositionTokenBridgeBase.BridgeConfig memory config =
                    PositionTokenBridge(payable(etherealBridge)).getBridgeConfig();
                console.log("Remote EID:", config.remoteEid);
                console.log("Remote Bridge:", config.remoteBridge);

                uint256 ethBalance = etherealBridge.balance;
                console.log("ETH Balance (for ACK):", ethBalance);

                if (deployer != address(0)) {
                    bytes32[] memory pending =
                        PositionTokenBridge(payable(etherealBridge)).getPendingBridges(deployer);
                    console.log("Pending bridges for deployer:", pending.length);
                }
            } catch {
                console.log("(Cannot read - wrong chain or not deployed)");
            }
            console.log("");
        }

        // Check Arbitrum Bridge
        if (arbBridge != address(0)) {
            console.log("--- Arbitrum Bridge ---");
            console.log("Address:", arbBridge);

            try PositionTokenBridgeRemote(payable(arbBridge)).isConfigComplete() returns (bool complete) {
                console.log("Config complete:", complete);

                IPositionTokenBridgeBase.BridgeConfig memory config =
                    PositionTokenBridgeRemote(payable(arbBridge)).getBridgeConfig();
                console.log("Remote EID:", config.remoteEid);
                console.log("Remote Bridge:", config.remoteBridge);

                address factoryAddr = PositionTokenBridgeRemote(payable(arbBridge)).getFactory();
                console.log("Factory:", factoryAddr);

                uint256 ethBalance = arbBridge.balance;
                console.log("ETH Balance (for ACK):", ethBalance);

                if (deployer != address(0)) {
                    bytes32[] memory pending =
                        PositionTokenBridgeRemote(payable(arbBridge)).getPendingBridges(deployer);
                    console.log("Pending bridges for deployer:", pending.length);
                }
            } catch {
                console.log("(Cannot read - wrong chain or not deployed)");
            }
            console.log("");
        }

        // Check Factory
        if (factory != address(0)) {
            console.log("--- Factory ---");
            console.log("Address:", factory);

            try PositionTokenFactory(factory).isConfigComplete() returns (bool complete) {
                console.log("Config complete:", complete);
                console.log("Deployer:", PositionTokenFactory(factory).deployer());
            } catch {
                console.log("(Cannot read - wrong chain or not deployed)");
            }
            console.log("");
        }

        // Check Test Token
        if (testToken != address(0) && deployer != address(0)) {
            console.log("--- Test Token ---");
            console.log("Address:", testToken);

            try IERC20(testToken).balanceOf(deployer) returns (uint256 balance) {
                console.log("Deployer balance:", balance);
            } catch {
                console.log("(Cannot read - wrong chain or not deployed)");
            }
            console.log("");
        }
    }
}
