// SPDX-License-Identifier: Apache 2
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IBridgedToken
 * @dev Interface for bridged ERC20 tokens with mint/burn capabilities
 */
interface IBridgedToken is IERC20 {
    /**
     * @notice Mint new tokens
     * @param to Recipient address
     * @param amount Amount to mint
     */
    function mint(address to, uint256 amount) external;

    /**
     * @notice Burn tokens from caller's balance
     * @param amount Amount to burn
     */
    function burn(uint256 amount) external;

    /**
     * @notice Burn tokens from an address (requires allowance)
     * @param from Address to burn from
     * @param amount Amount to burn
     */
    function burnFrom(address from, uint256 amount) external;

    /**
     * @notice Returns the number of decimals
     */
    function decimals() external view returns (uint8);
}
