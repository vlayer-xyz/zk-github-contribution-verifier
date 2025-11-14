// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IRiscZeroVerifier} from "risc0-ethereum/contracts/src/IRiscZeroVerifier.sol";

/// @title GitHubContributionVerifier
/// @notice Verifies and stores GitHub contribution proofs using ZK proofs from vlayer
/// @dev Uses RISC Zero verifier to validate ZK proofs generated from GitHub API data
contract GitHubContributionVerifier {
    /// @notice RISC Zero verifier contract
    IRiscZeroVerifier public immutable VERIFIER;

    /// @notice ZK proof program identifier
    /// @dev This should match the IMAGE_ID from your ZK proof program
    bytes32 public immutable IMAGE_ID;

    /// @notice Expected notary key fingerprint from vlayer
    bytes32 public immutable EXPECTED_NOTARY_KEY_FINGERPRINT;

    /// @notice Expected queries hash - validates correct fields are extracted
    /// @dev Computed from the JMESPath queries used to extract username and contributions
    bytes32 public immutable EXPECTED_QUERIES_HASH;

    /// @notice Expected URL pattern for GitHub API
    string public expectedUrlPattern;

    /// @notice Mapping of repo (owner/repo) => username => contributions
    mapping(string => mapping(string => uint256)) public contributionsByRepoAndUser;

    /// @notice Emitted when a contribution is successfully verified
    event ContributionVerified(
        string indexed username,
        uint256 contributions,
        string repoUrl,
        uint256 timestamp,
        uint256 blockNumber
    );

    /// @notice Custom errors
    error InvalidNotaryKeyFingerprint();
    error InvalidQueriesHash();
    error InvalidUrl();
    error ZKProofVerificationFailed();
    error InvalidContributions();

    /// @notice Contract constructor
    /// @param _verifier Address of the RISC Zero verifier contract
    /// @param _imageId ZK proof program identifier (IMAGE_ID)
    /// @param _expectedNotaryKeyFingerprint Expected notary key fingerprint from vlayer
    /// @param _expectedQueriesHash Expected hash of extraction queries
    /// @param _expectedUrlPattern Expected GitHub API URL pattern
    constructor(
        address _verifier,
        bytes32 _imageId,
        bytes32 _expectedNotaryKeyFingerprint,
        bytes32 _expectedQueriesHash,
        string memory _expectedUrlPattern
    ) {
        VERIFIER = IRiscZeroVerifier(_verifier);
        IMAGE_ID = _imageId;
        EXPECTED_NOTARY_KEY_FINGERPRINT = _expectedNotaryKeyFingerprint;
        EXPECTED_QUERIES_HASH = _expectedQueriesHash;
        expectedUrlPattern = _expectedUrlPattern;
    }

    /// @notice Submit and verify a GitHub contribution proof
    /// @param journalData Encoded proof data containing public outputs
    /// @param seal ZK proof seal for verification
    /// @dev Journal data should be abi.encoded as: (notaryKeyFingerprint, method, url, timestamp, queriesHash, repoNameWithOwner, username, contributions)
    function submitContribution(
        bytes calldata journalData,
        bytes calldata seal
    ) external {
        // Decode the journal data
        (
            bytes32 notaryKeyFingerprint,
            string memory _method,
            string memory url,
            uint256 timestamp,
            bytes32 queriesHash,
            string memory repoNameWithOwner,
            string memory username,
            uint256 contributions
        ) = abi.decode(journalData, (bytes32, string, string, uint256, bytes32, string, string, uint256));

        // Validate notary key fingerprint
        if (notaryKeyFingerprint != EXPECTED_NOTARY_KEY_FINGERPRINT) {
            revert InvalidNotaryKeyFingerprint();
        }

        // Validate queries hash
        if (queriesHash != EXPECTED_QUERIES_HASH) {
            revert InvalidQueriesHash();
        }

        // Validate URL equals the expected endpoint pattern provided at deployment
        if (keccak256(bytes(url)) != keccak256(bytes(expectedUrlPattern))) {
            revert InvalidUrl();
        }

        // Validate contributions is a reasonable number
        if (contributions == 0 || contributions > 1000000) {
            revert InvalidContributions();
        }

        // Verify the ZK proof
        try VERIFIER.verify(seal, IMAGE_ID, sha256(journalData)) {
            // Proof verified successfully
        } catch {
            revert ZKProofVerificationFailed();
        }

        // Store the contribution value for the specific repo and user
        contributionsByRepoAndUser[repoNameWithOwner][username] = contributions;

        emit ContributionVerified(
            username,
            contributions,
            url,
            timestamp,
            block.number
        );
    }
}
