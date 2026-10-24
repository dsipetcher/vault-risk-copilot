// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {SimpleVault} from "../src/SimpleVault.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SimpleVaultTest is Test {
    SimpleVault public vault;
    MockUSDC public usdc;

    address public owner = makeAddr("owner");
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public attacker = makeAddr("attacker");

    uint256 constant INITIAL_DEPOSIT_CAP = 1_000_000 * 10 ** 6; // 1M USDC
    uint256 constant USDC_UNIT = 10 ** 6;

    event DepositCapUpdated(uint256 oldCap, uint256 newCap);
    event Harvested(uint256 amount, uint256 timestamp);

    function setUp() public {
        usdc = new MockUSDC();

        vm.prank(owner);
        vault = new SimpleVault(IERC20(address(usdc)), "Simple Vault USDC", "svUSDC", INITIAL_DEPOSIT_CAP, owner);

        // Mint USDC to test users
        usdc.mint(alice, 100_000 * USDC_UNIT);
        usdc.mint(bob, 100_000 * USDC_UNIT);
        usdc.mint(attacker, 10_000 * USDC_UNIT);
        usdc.mint(owner, 50_000 * USDC_UNIT);
    }

    /*//////////////////////////////////////////////////////////////
                            BASIC TESTS
    //////////////////////////////////////////////////////////////*/

    function test_Metadata() public view {
        assertEq(vault.name(), "Simple Vault USDC");
        assertEq(vault.symbol(), "svUSDC");
        // ERC-4626 vault decimals = asset decimals + _decimalsOffset()
        // USDC has 6 decimals, offset is 3, so vault has 9 decimals
        assertEq(vault.decimals(), 9);
        assertEq(address(vault.asset()), address(usdc));
        assertEq(vault.owner(), owner);
    }

    function test_InitialState() public view {
        assertEq(vault.totalAssets(), 0);
        assertEq(vault.totalSupply(), 0);
        assertEq(vault.depositCap(), INITIAL_DEPOSIT_CAP);
        assertEq(vault.totalHarvested(), 0);
        assertEq(vault.paused(), false);
    }

    function test_DecimalsOffset() public view {
        // Virtual shares protection is internal, but we can verify behavior
        // First deposit should mint shares accounting for offset
        assertEq(vault.totalSupply(), 0);
    }

    /*//////////////////////////////////////////////////////////////
                         DEPOSIT TESTS
    //////////////////////////////////////////////////////////////*/

    function test_Deposit() public {
        uint256 depositAmount = 1000 * USDC_UNIT;

        vm.startPrank(alice);
        usdc.approve(address(vault), depositAmount);
        uint256 shares = vault.deposit(depositAmount, alice);
        vm.stopPrank();

        assertEq(vault.balanceOf(alice), shares);
        assertEq(vault.totalAssets(), depositAmount);
        assertEq(usdc.balanceOf(alice), 100_000 * USDC_UNIT - depositAmount);
        assertGt(shares, 0);
    }

    function test_DepositToReceiver() public {
        uint256 depositAmount = 1000 * USDC_UNIT;

        vm.startPrank(alice);
        usdc.approve(address(vault), depositAmount);
        uint256 shares = vault.deposit(depositAmount, bob);
        vm.stopPrank();

        assertEq(vault.balanceOf(alice), 0);
        assertEq(vault.balanceOf(bob), shares);
        assertEq(vault.totalAssets(), depositAmount);
    }

    function test_MultipleDeposits() public {
        uint256 amount1 = 1000 * USDC_UNIT;
        uint256 amount2 = 500 * USDC_UNIT;

        vm.startPrank(alice);
        usdc.approve(address(vault), amount1 + amount2);
        uint256 shares1 = vault.deposit(amount1, alice);
        uint256 shares2 = vault.deposit(amount2, alice);
        vm.stopPrank();

        assertEq(vault.balanceOf(alice), shares1 + shares2);
        assertEq(vault.totalAssets(), amount1 + amount2);
    }

    function test_RevertDepositWhenPaused() public {
        vm.prank(owner);
        vault.pause();

        vm.startPrank(alice);
        usdc.approve(address(vault), 1000 * USDC_UNIT);

        vm.expectRevert();
        vault.deposit(1000 * USDC_UNIT, alice);
        vm.stopPrank();
    }

    function test_RevertDepositExceedsCap() public {
        uint256 exceedAmount = INITIAL_DEPOSIT_CAP + 1;

        usdc.mint(alice, exceedAmount);

        vm.startPrank(alice);
        usdc.approve(address(vault), exceedAmount);

        vm.expectRevert();
        vault.deposit(exceedAmount, alice);
        vm.stopPrank();
    }

    function test_DepositNoCap() public {
        // Remove deposit cap
        vm.prank(owner);
        vault.setDepositCap(0);

        uint256 largeAmount = 10_000_000 * USDC_UNIT;
        usdc.mint(alice, largeAmount);

        vm.startPrank(alice);
        usdc.approve(address(vault), largeAmount);
        uint256 shares = vault.deposit(largeAmount, alice);
        vm.stopPrank();

        assertEq(vault.totalAssets(), largeAmount);
        assertGt(shares, 0);
    }

    /*//////////////////////////////////////////////////////////////
                           MINT TESTS
    //////////////////////////////////////////////////////////////*/

    function test_Mint() public {
        uint256 sharesAmount = 1000 * USDC_UNIT;

        vm.startPrank(alice);
        usdc.approve(address(vault), type(uint256).max);
        uint256 assets = vault.mint(sharesAmount, alice);
        vm.stopPrank();

        assertEq(vault.balanceOf(alice), sharesAmount);
        assertGt(assets, 0);
    }

    /*//////////////////////////////////////////////////////////////
                         WITHDRAW TESTS
    //////////////////////////////////////////////////////////////*/

    function test_Withdraw() public {
        uint256 depositAmount = 1000 * USDC_UNIT;
        uint256 withdrawAmount = 400 * USDC_UNIT;

        vm.startPrank(alice);
        usdc.approve(address(vault), depositAmount);
        vault.deposit(depositAmount, alice);

        uint256 balanceBefore = usdc.balanceOf(alice);
        uint256 shares = vault.withdraw(withdrawAmount, alice, alice);
        uint256 balanceAfter = usdc.balanceOf(alice);
        vm.stopPrank();

        assertEq(balanceAfter - balanceBefore, withdrawAmount);
        assertGt(shares, 0);
        assertEq(vault.totalAssets(), depositAmount - withdrawAmount);
    }

    function test_WithdrawAll() public {
        uint256 depositAmount = 1000 * USDC_UNIT;

        vm.startPrank(alice);
        usdc.approve(address(vault), depositAmount);
        vault.deposit(depositAmount, alice);

        vault.withdraw(depositAmount, alice, alice);
        vm.stopPrank();

        assertEq(vault.balanceOf(alice), 0);
        assertEq(vault.totalAssets(), 0);
    }

    function test_RevertWithdrawWhenPaused() public {
        uint256 depositAmount = 1000 * USDC_UNIT;

        vm.startPrank(alice);
        usdc.approve(address(vault), depositAmount);
        vault.deposit(depositAmount, alice);
        vm.stopPrank();

        vm.prank(owner);
        vault.pause();

        vm.prank(alice);
        vm.expectRevert();
        vault.withdraw(depositAmount, alice, alice);
    }

    /*//////////////////////////////////////////////////////////////
                          REDEEM TESTS
    //////////////////////////////////////////////////////////////*/

    function test_Redeem() public {
        uint256 depositAmount = 1000 * USDC_UNIT;

        vm.startPrank(alice);
        usdc.approve(address(vault), depositAmount);
        uint256 shares = vault.deposit(depositAmount, alice);

        uint256 halfShares = shares / 2;
        uint256 assets = vault.redeem(halfShares, alice, alice);
        vm.stopPrank();

        assertEq(vault.balanceOf(alice), shares - halfShares);
        assertGt(assets, 0);
        assertApproxEqRel(assets, depositAmount / 2, 0.001e18); // Within 0.1%
    }

    /*//////////////////////////////////////////////////////////////
                        HARVEST (YIELD) TESTS
    //////////////////////////////////////////////////////////////*/

    function test_Harvest() public {
        uint256 depositAmount = 1000 * USDC_UNIT;
        uint256 yieldAmount = 100 * USDC_UNIT;

        // Alice deposits
        vm.startPrank(alice);
        usdc.approve(address(vault), depositAmount);
        uint256 sharesBefore = vault.deposit(depositAmount, alice);
        vm.stopPrank();

        // Owner harvests (adds yield)
        vm.startPrank(owner);
        usdc.approve(address(vault), yieldAmount);

        vm.expectEmit(true, true, false, true);
        emit Harvested(yieldAmount, block.timestamp);

        vault.harvest(yieldAmount);
        vm.stopPrank();

        assertEq(vault.totalAssets(), depositAmount + yieldAmount);
        assertEq(vault.totalHarvested(), yieldAmount);
        assertEq(vault.balanceOf(alice), sharesBefore); // Shares unchanged

        // Share price increased - convert 1 share unit (remember vault has 9 decimals)
        uint256 oneShare = 10 ** vault.decimals();
        uint256 assetsPerShare = vault.convertToAssets(oneShare);
        assertGt(assetsPerShare, 1 * USDC_UNIT); // Should be more than 1 USDC per share unit
    }

    function test_HarvestMultipleTimes() public {
        uint256 depositAmount = 1000 * USDC_UNIT;

        vm.startPrank(alice);
        usdc.approve(address(vault), depositAmount);
        vault.deposit(depositAmount, alice);
        vm.stopPrank();

        vm.startPrank(owner);
        usdc.approve(address(vault), type(uint256).max);

        vault.harvest(50 * USDC_UNIT);
        vault.harvest(30 * USDC_UNIT);
        vault.harvest(20 * USDC_UNIT);
        vm.stopPrank();

        assertEq(vault.totalHarvested(), 100 * USDC_UNIT);
        assertEq(vault.totalAssets(), depositAmount + 100 * USDC_UNIT);
    }

    function test_RevertHarvestNotOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        vault.harvest(100 * USDC_UNIT);
    }

    function test_RevertHarvestZeroAmount() public {
        vm.prank(owner);
        vm.expectRevert();
        vault.harvest(0);
    }

    /*//////////////////////////////////////////////////////////////
                    SHARE PRICE & CONVERSION TESTS
    //////////////////////////////////////////////////////////////*/

    function test_SharePriceIncreaseAfterYield() public {
        uint256 depositAmount = 1000 * USDC_UNIT;
        uint256 yieldAmount = 100 * USDC_UNIT;

        vm.startPrank(alice);
        usdc.approve(address(vault), depositAmount);
        uint256 shares = vault.deposit(depositAmount, alice);
        vm.stopPrank();

        uint256 priceBeforeYield = vault.convertToAssets(shares);

        vm.startPrank(owner);
        usdc.approve(address(vault), yieldAmount);
        vault.harvest(yieldAmount);
        vm.stopPrank();

        uint256 priceAfterYield = vault.convertToAssets(shares);

        assertGt(priceAfterYield, priceBeforeYield);
        assertApproxEqRel(priceAfterYield, depositAmount + yieldAmount, 0.001e18);
    }

    function test_NewDepositorGetsFairPrice() public {
        uint256 depositAmount = 1000 * USDC_UNIT;
        uint256 yieldAmount = 100 * USDC_UNIT;

        // Alice deposits first
        vm.startPrank(alice);
        usdc.approve(address(vault), depositAmount);
        vault.deposit(depositAmount, alice);
        vm.stopPrank();

        // Yield added
        vm.startPrank(owner);
        usdc.approve(address(vault), yieldAmount);
        vault.harvest(yieldAmount);
        vm.stopPrank();

        // Bob deposits same amount after yield
        vm.startPrank(bob);
        usdc.approve(address(vault), depositAmount);
        uint256 bobShares = vault.deposit(depositAmount, bob);
        vm.stopPrank();

        // Bob should get fewer shares (higher price per share)
        uint256 aliceShares = vault.balanceOf(alice);
        assertLt(bobShares, aliceShares);
    }

    /*//////////////////////////////////////////////////////////////
                       ACCESS CONTROL TESTS
    //////////////////////////////////////////////////////////////*/

    function test_SetDepositCap() public {
        uint256 newCap = 2_000_000 * USDC_UNIT;

        vm.prank(owner);
        vm.expectEmit(true, true, false, true);
        emit DepositCapUpdated(INITIAL_DEPOSIT_CAP, newCap);

        vault.setDepositCap(newCap);

        assertEq(vault.depositCap(), newCap);
    }

    function test_RevertSetDepositCapNotOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        vault.setDepositCap(2_000_000 * USDC_UNIT);
    }

    function test_Pause() public {
        vm.prank(owner);
        vault.pause();

        assertTrue(vault.paused());
    }

    function test_Unpause() public {
        vm.startPrank(owner);
        vault.pause();
        vault.unpause();
        vm.stopPrank();

        assertFalse(vault.paused());
    }

    function test_RevertPauseNotOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        vault.pause();
    }

    function test_OwnershipTransfer() public {
        address newOwner = makeAddr("newOwner");

        vm.startPrank(owner);
        vault.transferOwnership(newOwner);
        vm.stopPrank();

        vm.prank(newOwner);
        vault.acceptOwnership();

        assertEq(vault.owner(), newOwner);
    }

    /*//////////////////////////////////////////////////////////////
                      INFLATION ATTACK TEST
    //////////////////////////////////////////////////////////////*/

    function test_InflationAttackMitigation() public {
        // Attacker tries to inflate share price before first depositor

        // Give attacker enough funds for the attack
        uint256 donationAmount = 1_000 * USDC_UNIT;
        usdc.mint(attacker, donationAmount);

        // Step 1: Attacker deposits 1 wei
        vm.startPrank(attacker);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(1, attacker);

        // Step 2: Attacker tries to donate large amount to inflate price
        usdc.transfer(address(vault), donationAmount);
        vm.stopPrank();

        // Step 3: Alice deposits normally
        uint256 aliceDeposit = 1000 * USDC_UNIT;
        vm.startPrank(alice);
        usdc.approve(address(vault), aliceDeposit);
        uint256 aliceShares = vault.deposit(aliceDeposit, alice);
        vm.stopPrank();

        // Alice should receive a reasonable amount of shares
        // Without protection, Alice would get 0 or very few shares
        // With OZ 5.x virtual shares, Alice gets fair shares
        assertGt(aliceShares, 0); // Alice gets shares

        // Alice should be able to withdraw most of her deposit
        vm.prank(alice);
        uint256 withdrawn = vault.redeem(aliceShares, alice, alice);

        // Alice should get back most of her deposit (within reasonable rounding)
        // The donation by attacker is "captured" by the vault, benefiting all shareholders
        assertGt(withdrawn, aliceDeposit * 99 / 100); // At least 99% back
    }

    /*//////////////////////////////////////////////////////////////
                          FUZZ TESTS
    //////////////////////////////////////////////////////////////*/

    function testFuzz_DepositRedeem(uint256 depositAmount) public {
        depositAmount = bound(depositAmount, 1 * USDC_UNIT, 10_000 * USDC_UNIT);

        usdc.mint(alice, depositAmount);

        vm.startPrank(alice);
        usdc.approve(address(vault), depositAmount);
        uint256 shares = vault.deposit(depositAmount, alice);

        uint256 withdrawn = vault.redeem(shares, alice, alice);
        vm.stopPrank();

        // Should get back approximately the same amount (within rounding)
        assertApproxEqRel(withdrawn, depositAmount, 0.001e18);
        assertEq(vault.balanceOf(alice), 0);
    }

    function testFuzz_DepositWithdraw(uint256 depositAmount) public {
        depositAmount = bound(depositAmount, 1 * USDC_UNIT, 10_000 * USDC_UNIT);

        usdc.mint(alice, depositAmount);

        vm.startPrank(alice);
        usdc.approve(address(vault), depositAmount);
        vault.deposit(depositAmount, alice);

        vault.withdraw(depositAmount, alice, alice);
        vm.stopPrank();

        // Shares should be approximately zero (within rounding)
        assertLe(vault.balanceOf(alice), 10); // Allow small rounding dust
    }

    function testFuzz_MultipleUsers(uint256 aliceAmount, uint256 bobAmount, uint256 yieldAmount) public {
        aliceAmount = bound(aliceAmount, 100 * USDC_UNIT, 10_000 * USDC_UNIT);
        bobAmount = bound(bobAmount, 100 * USDC_UNIT, 10_000 * USDC_UNIT);
        yieldAmount = bound(yieldAmount, 10 * USDC_UNIT, 1_000 * USDC_UNIT);

        usdc.mint(alice, aliceAmount);
        usdc.mint(bob, bobAmount);
        usdc.mint(owner, yieldAmount);

        // Alice deposits
        vm.startPrank(alice);
        usdc.approve(address(vault), aliceAmount);
        uint256 aliceShares = vault.deposit(aliceAmount, alice);
        vm.stopPrank();

        // Yield added
        vm.startPrank(owner);
        usdc.approve(address(vault), yieldAmount);
        vault.harvest(yieldAmount);
        vm.stopPrank();

        // Bob deposits
        vm.startPrank(bob);
        usdc.approve(address(vault), bobAmount);
        uint256 bobShares = vault.deposit(bobAmount, bob);
        vm.stopPrank();

        // Total assets should equal deposits + yield
        assertEq(vault.totalAssets(), aliceAmount + bobAmount + yieldAmount);

        // Total shares should equal alice + bob shares
        assertEq(vault.totalSupply(), aliceShares + bobShares);
    }
}
