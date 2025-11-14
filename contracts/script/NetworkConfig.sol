// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {RiscZeroMockVerifier} from "risc0-ethereum/contracts/src/test/RiscZeroMockVerifier.sol";

/// @title NetworkConfig
/// @notice Provides network-specific configuration for deployments
/// @dev Contains verifier addresses and other network-specific parameters
contract NetworkConfig is Script {
    struct Config {
        address verifier;
        string name;
    }

    // Chain IDs (supported)
    uint256 constant SEPOLIA_CHAIN_ID = 11155111;
    uint256 constant BASE_SEPOLIA_CHAIN_ID = 84532;
    uint256 constant OP_SEPOLIA_CHAIN_ID = 11155420;
    uint256 constant ANVIL_CHAIN_ID = 31337;

    // RISC Zero Verifier Addresses (placeholders - replace with actual addresses)
    // Check https://dev.risczero.com/api/blockchain-integration/contracts/verifier
    address constant SEPOLIA_VERIFIER = 0x0000000000000000000000000000000000000000;
    address constant BASE_SEPOLIA_VERIFIER = 0x0000000000000000000000000000000000000000;
    address constant OP_SEPOLIA_VERIFIER = 0x0000000000000000000000000000000000000000;

    /// @notice Get configuration for the current network
    /// @return config Network configuration including verifier address
    function getConfig() public returns (Config memory) {
        return getConfigByChainId(block.chainid);
    }

    /// @notice Get configuration for a specific chain
    /// @param chainId The chain ID to get config for
    /// @return config Network configuration
    function getConfigByChainId(uint256 chainId) public returns (Config memory) {
        if (chainId == SEPOLIA_CHAIN_ID) {
            return Config({
                verifier: SEPOLIA_VERIFIER,
                name: "sepolia"
            });
        } else if (chainId == BASE_SEPOLIA_CHAIN_ID) {
            return Config({
                verifier: BASE_SEPOLIA_VERIFIER,
                name: "baseSepolia"
            });
        } else if (chainId == OP_SEPOLIA_CHAIN_ID) {
            return Config({
                verifier: OP_SEPOLIA_VERIFIER,
                name: "opSepolia"
            });
        } else if (chainId == ANVIL_CHAIN_ID) {
            return getAnvilConfig();
        } else {
            revert("Unsupported network");
        }
    }

    /// @notice Get configuration for local Anvil network
    /// @dev For Anvil, we deploy a mock verifier
    /// @return config Anvil network configuration
    function getAnvilConfig() public returns (Config memory) {
        // Deploy a mock verifier for local testing
        address mockVerifier = deployMockVerifier();
        return Config({
            verifier: mockVerifier,
            name: "anvil"
        });
    }

    /// @notice Deploy a mock verifier for testing
    /// @dev Only used for local Anvil network
    /// @return address Address of the mock verifier
    function deployMockVerifier() internal returns (address) {
        vm.startBroadcast();
        RiscZeroMockVerifier mock = new RiscZeroMockVerifier(bytes4(0xFFFFFFFF));
        vm.stopBroadcast();
        return address(mock);
    }
}
