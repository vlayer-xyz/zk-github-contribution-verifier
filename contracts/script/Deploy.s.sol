// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {GitHubContributionVerifier} from "../src/GitHubContributionVerifier.sol";
import {NetworkConfig} from "./NetworkConfig.sol";

/// @title Deploy
/// @notice Deployment script for GitHubContributionVerifier contract
contract Deploy is Script {
    /// @notice Main deployment function
    /// @return verifier Deployed GitHubContributionVerifier contract
    function run() external returns (GitHubContributionVerifier) {
        return deploy();
    }

    /// @notice Deploy the GitHubContributionVerifier contract
    /// @return verifier Deployed contract instance
    function deploy() public returns (GitHubContributionVerifier) {
        // Get network configuration
        NetworkConfig networkConfig = new NetworkConfig();
        NetworkConfig.Config memory config = networkConfig.getConfig();

        console.log("Deploying to network:", config.name);
        console.log("Chain ID:", block.chainid);
        console.log("Using verifier at:", config.verifier);

        // Get deployment parameters from environment variables
        bytes32 imageId = vm.envOr("ZK_PROVER_GUEST_ID", bytes32(0));
        bytes32 notaryKeyFingerprint = vm.envOr(
            "NOTARY_KEY_FINGERPRINT",
            bytes32(0)
        );
        bytes32 queriesHash = vm.envOr("QUERIES_HASH", bytes32(0));
        string memory expectedUrl = vm.envOr(
            "EXPECTED_URL",
            string("https://api.github.com/graphql")
        );

        // Validate parameters
        require(imageId != bytes32(0), "ZK_PROVER_GUEST_ID not set");
        require(
            notaryKeyFingerprint != bytes32(0),
            "NOTARY_KEY_FINGERPRINT not set"
        );
        require(queriesHash != bytes32(0), "QUERIES_HASH not set");

        console.log("Image ID:");
        console.logBytes32(imageId);
        console.log("Notary Key Fingerprint:");
        console.logBytes32(notaryKeyFingerprint);
        console.log("Queries Hash:");
        console.logBytes32(queriesHash);
        console.log("Expected URL pattern:", expectedUrl);

        // Deploy contract
        vm.startBroadcast();

        GitHubContributionVerifier verifier = new GitHubContributionVerifier(
            config.verifier,
            imageId,
            notaryKeyFingerprint,
            queriesHash,
            expectedUrl
        );

        vm.stopBroadcast();

        console.log(
            "GitHubContributionVerifier deployed at:",
            address(verifier)
        );
        console.log("Deployment complete!");

        // Save deployment address to file
        _saveDeployment(config.name, address(verifier));

        return verifier;
    }

    /// @notice Save deployment address to a JSON file
    /// @param network Network name
    /// @param contractAddress Deployed contract address
    function _saveDeployment(string memory network, address contractAddress)
        internal
    {
        string memory path = string.concat(
            "deployments/",
            network,
            ".json"
        );

        string memory json = string.concat(
            '{\n',
            '  "GitHubContributionVerifier": "',
            vm.toString(contractAddress),
            '",\n',
            '  "chainId": ',
            vm.toString(block.chainid),
            ',\n',
            '  "timestamp": ',
            vm.toString(block.timestamp),
            '\n',
            '}'
        );

        vm.writeFile(path, json);
        console.log("Deployment info saved to:", path);
    }
}
