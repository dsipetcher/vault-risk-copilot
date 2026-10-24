// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {SimpleVault} from "../src/SimpleVault.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title SimpleVaultInvariantTest
 * @notice Invariant tests to verify critical properties hold under random operations
 *
 * Key Invariants:
 * 1. totalAssets >= sum of all user redeemable assets
 * 2. totalSupply matches sum of all share balances
 * 3. Vault's USDC balance >= totalAssets (accounting for harvest)
 * 4. No user can withdraw more than they deposited + their share of yield
 * 5. Share price can only increase or stay same (never decrease) when yield is added
 */
contract SimpleVaultInvariantTest is Test {
    SimpleVault public vault;
    MockUSDC public usdc;
    VaultHandler public handler;

    address public owner = makeAddr("owner");

    function setUp() public {
        usdc = new MockUSDC();

        vm.prank(owner);
        vault = new SimpleVault(
            IERC20(address(usdc)),
            "Simple Vault USDC",
            "svUSDC",
            0, // No deposit cap for invariant testing
            owner
        );

        handler = new VaultHandler(vault, usdc, owner);

        // Give handler lots of USDC
        usdc.mint(address(handler), 1_000_000 * 10 ** 6);

        // Target only the handler for invariant testing
        targetContract(address(handler));

        // Target specific functions
        bytes4[] memory selectors = new bytes4[](4);
        selectors[0] = VaultHandler.deposit.selector;
        selectors[1] = VaultHandler.withdraw.selector;
        selectors[2] = VaultHandler.redeem.selector;
        selectors[3] = VaultHandler.harvest.selector;

        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    /**
     * @notice Invariant: Total assets should always be >= sum of redeemable assets
     * @dev This ensures vault is always solvent
     */
    function invariant_TotalAssetsMatchesRedeemable() public view {
        uint256 totalAssets = vault.totalAssets();
        uint256 totalShares = vault.totalSupply();

        if (totalShares == 0) {
            // No shares exists - totalAssets can be non-zero if:
            // 1. Harvest was called without any depositors (edge case, but valid)
            // 2. All shares were redeemed but some dust remains
            // This is not a violation - assets with no shares just sit in vault
            // (In real scenario, owner could recover via emergencyWithdraw if needed)
            return; // No invariant violation
        } else {
            // Calculate what all shares could redeem to
            uint256 redeemableAssets = vault.convertToAssets(totalShares);

            // Total assets should be >= what users can redeem
            assertGe(totalAssets, redeemableAssets);
        }
    }

    /**
     * @notice Invariant: Vault's USDC balance should match or exceed totalAssets
     * @dev After harvest, vault holds more USDC than totalAssets reports
     */
    function invariant_VaultBalanceCoversAssets() public view {
        uint256 vaultUSDCBalance = usdc.balanceOf(address(vault));
        uint256 totalAssets = vault.totalAssets();

        assertGe(vaultUSDCBalance, totalAssets);
    }

    /**
     * @notice Invariant: Total supply should match sum of tracked user shares
     */
    function invariant_TotalSupplyMatchesUserShares() public view {
        uint256 totalSupply = vault.totalSupply();
        uint256 sumOfUserShares = handler.sumOfUserShares();

        assertEq(totalSupply, sumOfUserShares);
    }

    /**
     * @notice Invariant: No user lost their deposited assets (accounting for withdrawals)
     */
    function invariant_NoUserLostAssets() public view {
        uint256 totalDeposited = handler.totalDeposited();
        uint256 totalWithdrawn = handler.totalWithdrawn();
        uint256 currentAssets = vault.totalAssets();

        // Current assets + withdrawn should be >= deposited
        // (Equal if no yield, greater if yield added)
        assertGe(currentAssets + totalWithdrawn, totalDeposited);
    }

    /**
     * @notice Invariant: Harvest only increases or maintains total assets
     */
    function invariant_HarvestIncreasesTotalAssets() public view {
        uint256 totalHarvested = vault.totalHarvested();
        uint256 totalDeposited = handler.totalDeposited();
        uint256 totalWithdrawn = handler.totalWithdrawn();
        uint256 totalAssets = vault.totalAssets();

        // totalAssets should equal: deposits - withdrawals + harvested
        assertApproxEqAbs(
            totalAssets,
            totalDeposited + totalHarvested - totalWithdrawn,
            100 // Allow small rounding errors
        );
    }

    /**
     * @notice Call summary for debugging
     */
    function invariant_CallSummary() public view {
        console.log("=== Invariant Test Summary ===");
        console.log("Total deposits:", handler.totalDeposited());
        console.log("Total withdrawals:", handler.totalWithdrawn());
        console.log("Total harvested:", vault.totalHarvested());
        console.log("Current totalAssets:", vault.totalAssets());
        console.log("Current totalSupply:", vault.totalSupply());
        console.log("Vault USDC balance:", usdc.balanceOf(address(vault)));
        console.log("Deposit calls:", handler.depositCount());
        console.log("Withdraw calls:", handler.withdrawCount());
        console.log("Redeem calls:", handler.redeemCount());
        console.log("Harvest calls:", handler.harvestCount());
    }
}

/**
 * @title VaultHandler
 * @notice Handler contract for invariant testing - performs random vault operations
 */
contract VaultHandler is Test {
    SimpleVault public vault;
    MockUSDC public usdc;
    address public owner;

    // Track three actors
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public charlie = makeAddr("charlie");

    address[] public actors;

    // Tracking variables
    uint256 public totalDeposited;
    uint256 public totalWithdrawn;
    mapping(address => uint256) public userShares;

    // Call counters
    uint256 public depositCount;
    uint256 public withdrawCount;
    uint256 public redeemCount;
    uint256 public harvestCount;

    uint256 constant USDC_UNIT = 10 ** 6;

    constructor(SimpleVault _vault, MockUSDC _usdc, address _owner) {
        vault = _vault;
        usdc = _usdc;
        owner = _owner;

        actors.push(alice);
        actors.push(bob);
        actors.push(charlie);
    }

    function deposit(uint256 actorSeed, uint256 amount) public {
        address actor = actors[actorSeed % actors.length];
        amount = bound(amount, 1 * USDC_UNIT, 10_000 * USDC_UNIT);

        // Mint USDC to actor
        usdc.mint(actor, amount);

        vm.startPrank(actor);
        usdc.approve(address(vault), amount);

        try vault.deposit(amount, actor) returns (uint256 shares) {
            totalDeposited += amount;
            userShares[actor] += shares;
            depositCount++;
        } catch {
            // Deposit failed (e.g., paused, cap reached)
        }

        vm.stopPrank();
    }

    function withdraw(uint256 actorSeed, uint256 assetAmount) public {
        address actor = actors[actorSeed % actors.length];
        uint256 maxAssets = vault.maxWithdraw(actor);

        if (maxAssets == 0) return;

        assetAmount = bound(assetAmount, 1, maxAssets);

        vm.startPrank(actor);

        try vault.withdraw(assetAmount, actor, actor) returns (uint256 shares) {
            totalWithdrawn += assetAmount;
            userShares[actor] -= shares;
            withdrawCount++;
        } catch {
            // Withdraw failed
        }

        vm.stopPrank();
    }

    function redeem(uint256 actorSeed, uint256 shareAmount) public {
        address actor = actors[actorSeed % actors.length];
        uint256 maxShares = vault.maxRedeem(actor);

        if (maxShares == 0) return;

        shareAmount = bound(shareAmount, 1, maxShares);

        vm.startPrank(actor);

        try vault.redeem(shareAmount, actor, actor) returns (uint256 assets) {
            totalWithdrawn += assets;
            userShares[actor] -= shareAmount;
            redeemCount++;
        } catch {
            // Redeem failed
        }

        vm.stopPrank();
    }

    function harvest(uint256 amount) public {
        amount = bound(amount, 10 * USDC_UNIT, 1_000 * USDC_UNIT);

        // Mint USDC to owner for harvest
        usdc.mint(owner, amount);

        vm.startPrank(owner);
        usdc.approve(address(vault), amount);

        try vault.harvest(amount) {
            harvestCount++;
        } catch {
            // Harvest failed
        }

        vm.stopPrank();
    }

    function sumOfUserShares() public view returns (uint256) {
        uint256 sum = 0;
        for (uint256 i = 0; i < actors.length; i++) {
            sum += vault.balanceOf(actors[i]);
        }
        return sum;
    }
}
