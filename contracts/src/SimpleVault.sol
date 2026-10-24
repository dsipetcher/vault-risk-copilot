// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title SimpleVault
 * @notice A simple ERC-4626 tokenized vault for learning purposes (testnet only)
 * @dev Implements deposit/withdraw/mint/redeem with security best practices:
 * - Protection against inflation/donation attacks (via OZ 5.x virtual shares)
 * - Pausable functionality
 * - Deposit cap
 * - Owner-controlled harvest (simulates yield generation)
 * - SafeERC20 for all token operations
 * - Reentrancy guards
 *
 * SECURITY: This is a learning project. Not audited. Testnet only.
 */
contract SimpleVault is ERC4626, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Maximum total assets that can be deposited
    uint256 public depositCap;

    /// @notice Total yield harvested by the vault
    uint256 public totalHarvested;

    // Events
    event DepositCapUpdated(uint256 oldCap, uint256 newCap);
    event Harvested(uint256 amount, uint256 timestamp);
    event EmergencyWithdraw(address indexed token, address indexed to, uint256 amount);

    // Errors
    error DepositCapExceeded(uint256 requested, uint256 cap);
    error InvalidDepositCap(uint256 cap);
    error ZeroAddress();
    error ZeroAmount();

    /**
     * @notice Initialize the vault
     * @param asset_ The ERC-20 token to be deposited (e.g., MockUSDC)
     * @param name_ Name of the vault shares token
     * @param symbol_ Symbol of the vault shares token
     * @param initialDepositCap_ Maximum total assets (0 = no cap)
     * @param owner_ Address of the vault owner
     */
    constructor(IERC20 asset_, string memory name_, string memory symbol_, uint256 initialDepositCap_, address owner_)
        ERC4626(asset_)
        ERC20(name_, symbol_)
        Ownable(owner_)
    {
        if (address(asset_) == address(0)) revert ZeroAddress();
        if (owner_ == address(0)) revert ZeroAddress();

        depositCap = initialDepositCap_;
        emit DepositCapUpdated(0, initialDepositCap_);
    }

    /**
     * @notice Override decimals offset for inflation attack protection
     * @dev OZ 5.x uses virtual shares/assets mechanism. This adds 3 decimals offset
     * to make the first deposit more expensive and prevent inflation attacks.
     * See: https://docs.openzeppelin.com/contracts/5.x/erc4626#inflation-attack
     */
    function _decimalsOffset() internal pure override returns (uint8) {
        return 3;
    }

    /**
     * @notice Deposit assets and receive shares
     * @dev Checks deposit cap and paused state
     */
    function deposit(uint256 assets, address receiver)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256 shares)
    {
        _checkDepositCap(assets);
        return super.deposit(assets, receiver);
    }

    /**
     * @notice Mint shares by depositing assets
     * @dev Checks deposit cap and paused state
     */
    function mint(uint256 shares, address receiver)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256 assets)
    {
        assets = previewMint(shares);
        _checkDepositCap(assets);
        return super.mint(shares, receiver);
    }

    /**
     * @notice Withdraw assets by burning shares
     * @dev Protected by pause and reentrancy guard
     */
    function withdraw(uint256 assets, address receiver, address owner)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256 shares)
    {
        return super.withdraw(assets, receiver, owner);
    }

    /**
     * @notice Redeem shares for assets
     * @dev Protected by pause and reentrancy guard
     */
    function redeem(uint256 shares, address receiver, address owner)
        public
        override
        nonReentrant
        whenNotPaused
        returns (uint256 assets)
    {
        return super.redeem(shares, receiver, owner);
    }

    /**
     * @notice Maximum assets that can be deposited by a user
     * @dev Considers deposit cap and paused state
     */
    function maxDeposit(address) public view override returns (uint256) {
        if (paused()) {
            return 0;
        }

        if (depositCap == 0) {
            return type(uint256).max;
        }

        uint256 currentAssets = totalAssets();
        if (currentAssets >= depositCap) {
            return 0;
        }

        return depositCap - currentAssets;
    }

    /**
     * @notice Maximum shares that can be minted by a user
     * @dev Considers deposit cap and paused state
     */
    function maxMint(address owner) public view override returns (uint256) {
        if (paused()) {
            return 0;
        }

        uint256 maxAssets = maxDeposit(owner);
        if (maxAssets == type(uint256).max) {
            return type(uint256).max;
        }

        return _convertToShares(maxAssets, Math.Rounding.Floor);
    }

    /**
     * @notice Simulate yield generation by transferring assets into the vault
     * @dev Owner transfers assets directly to increase share price
     * In a real vault, this would be yield from DeFi strategies
     * @param amount Amount of assets to add as yield
     */
    function harvest(uint256 amount) external onlyOwner {
        if (amount == 0) revert ZeroAmount();

        IERC20 _asset = IERC20(asset());
        _asset.safeTransferFrom(msg.sender, address(this), amount);

        totalHarvested += amount;
        emit Harvested(amount, block.timestamp);
    }

    /**
     * @notice Update the deposit cap
     * @param newCap New maximum total assets (0 = no cap)
     */
    function setDepositCap(uint256 newCap) external onlyOwner {
        uint256 oldCap = depositCap;
        depositCap = newCap;
        emit DepositCapUpdated(oldCap, newCap);
    }

    /**
     * @notice Pause deposits and withdrawals
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause deposits and withdrawals
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Emergency function to recover tokens sent by mistake
     * @dev Cannot withdraw the vault's underlying asset (use normal redeem)
     * @param token Address of the token to recover
     * @param to Address to send recovered tokens
     * @param amount Amount to recover
     */
    function emergencyWithdraw(address token, address to, uint256 amount) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        if (to == address(0)) revert ZeroAddress();
        if (token == asset()) revert("Cannot withdraw vault asset");

        IERC20(token).safeTransfer(to, amount);
        emit EmergencyWithdraw(token, to, amount);
    }

    /**
     * @notice Check if deposit would exceed cap
     */
    function _checkDepositCap(uint256 assets) internal view {
        if (depositCap == 0) {
            return; // No cap
        }

        uint256 currentAssets = totalAssets();
        if (currentAssets + assets > depositCap) {
            revert DepositCapExceeded(currentAssets + assets, depositCap);
        }
    }

    /**
     * @notice Helper to convert assets to shares with rounding
     * @dev Override from ERC4626 to use custom conversion logic
     */
    function _convertToShares(uint256 assets, Math.Rounding rounding) internal view override returns (uint256) {
        return Math.mulDiv(assets, totalSupply() + 10 ** _decimalsOffset(), totalAssets() + 1, rounding);
    }
}
