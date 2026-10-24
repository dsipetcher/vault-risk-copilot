// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {SimpleVault} from "../src/SimpleVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title Deploy
 * @notice Deployment script for Sepolia testnet
 * @dev Usage:
 *   forge script script/Deploy.s.sol:Deploy --rpc-url sepolia --broadcast --verify
 */
contract Deploy is Script {
    // Deployment parameters
    uint256 constant DEPOSIT_CAP = 10_000_000 * 10 ** 6; // 10M USDC cap

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying with account:", deployer);
        console.log("Account balance:", deployer.balance);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy MockUSDC
        MockUSDC usdc = new MockUSDC();
        console.log("MockUSDC deployed at:", address(usdc));

        // Deploy SimpleVault
        SimpleVault vault = new SimpleVault(
            IERC20(address(usdc)),
            "Simple Vault USDC",
            "svUSDC",
            DEPOSIT_CAP,
            deployer // Owner
        );
        console.log("SimpleVault deployed at:", address(vault));
        console.log("Deposit cap:", DEPOSIT_CAP);

        // Mint some test USDC to deployer for testing
        usdc.mint(deployer, 10_000 * 10 ** 6); // 10k USDC
        console.log("Minted 10,000 test USDC to deployer");

        vm.stopBroadcast();

        // Output deployment info
        console.log("\n=== Deployment Complete ===");
        console.log("Network: Sepolia (chainid 11155111)");
        console.log("MockUSDC:", address(usdc));
        console.log("SimpleVault:", address(vault));
        console.log("Owner:", deployer);
        console.log("\nAdd these to your .env:");
        console.log("MOCK_USDC_ADDRESS=", address(usdc));
        console.log("VAULT_ADDRESS=", address(vault));
        console.log("\nVerify contracts with:");
        console.log("forge verify-contract <address> <contract> --chain sepolia");
    }
}
