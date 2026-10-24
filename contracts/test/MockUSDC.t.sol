// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract MockUSDCTest is Test {
    MockUSDC public usdc;
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    function setUp() public {
        usdc = new MockUSDC();
    }

    function test_Metadata() public view {
        assertEq(usdc.name(), "Mock USDC");
        assertEq(usdc.symbol(), "mUSDC");
        assertEq(usdc.decimals(), 6);
    }

    function test_Mint() public {
        uint256 amount = 1000 * 10 ** 6; // 1000 USDC

        usdc.mint(alice, amount);

        assertEq(usdc.balanceOf(alice), amount);
        assertEq(usdc.totalSupply(), amount);
    }

    function test_MintMultiple() public {
        uint256 amount1 = 500 * 10 ** 6;
        uint256 amount2 = 300 * 10 ** 6;

        usdc.mint(alice, amount1);
        usdc.mint(bob, amount2);

        assertEq(usdc.balanceOf(alice), amount1);
        assertEq(usdc.balanceOf(bob), amount2);
        assertEq(usdc.totalSupply(), amount1 + amount2);
    }

    function test_Burn() public {
        uint256 mintAmount = 1000 * 10 ** 6;
        uint256 burnAmount = 300 * 10 ** 6;

        usdc.mint(alice, mintAmount);

        vm.prank(alice);
        usdc.burn(burnAmount);

        assertEq(usdc.balanceOf(alice), mintAmount - burnAmount);
        assertEq(usdc.totalSupply(), mintAmount - burnAmount);
    }

    function test_Transfer() public {
        uint256 amount = 1000 * 10 ** 6;
        uint256 transferAmount = 400 * 10 ** 6;

        usdc.mint(alice, amount);

        vm.prank(alice);
        usdc.transfer(bob, transferAmount);

        assertEq(usdc.balanceOf(alice), amount - transferAmount);
        assertEq(usdc.balanceOf(bob), transferAmount);
    }

    function testFuzz_Mint(address to, uint256 amount) public {
        vm.assume(to != address(0));
        vm.assume(amount < type(uint128).max); // Prevent overflow

        usdc.mint(to, amount);

        assertEq(usdc.balanceOf(to), amount);
    }

    function testFuzz_Burn(uint256 mintAmount, uint256 burnAmount) public {
        vm.assume(mintAmount < type(uint128).max);
        vm.assume(burnAmount <= mintAmount);

        usdc.mint(alice, mintAmount);

        vm.prank(alice);
        usdc.burn(burnAmount);

        assertEq(usdc.balanceOf(alice), mintAmount - burnAmount);
    }
}
