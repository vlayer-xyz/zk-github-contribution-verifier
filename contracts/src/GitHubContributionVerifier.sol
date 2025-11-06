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
    bytes32 public constant IMAGE_ID = 0x0000000000000000000000000000000000000000000000000000000000000000;

    /// @notice Expected notary key fingerprint from vlayer
    bytes32 public immutable EXPECTED_NOTARY_KEY_FINGERPRINT;

    /// @notice Expected queries hash - validates correct fields are extracted
    /// @dev Computed from the JMESPath queries used to extract username and contributions
    bytes32 public immutable EXPECTED_QUERIES_HASH;

    /// @notice Expected URL pattern for GitHub API
    string public expectedUrlPattern;

    /// @notice Contribution record structure
    struct ContributionRecord {
        string username;
        uint256 contributions;
        uint256 timestamp;
        uint256 blockNumber;
        string repoUrl;
    }

    /// @notice Mapping of username to their contribution records
    mapping(string => ContributionRecord[]) public contributionHistory;

    /// @notice Mapping to get latest contribution for a user
    mapping(string => ContributionRecord) public latestContribution;

    /// @notice Total number of verified contributions
    uint256 public totalVerifiedContributions;

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
    /// @param _expectedNotaryKeyFingerprint Expected notary key fingerprint from vlayer
    /// @param _expectedQueriesHash Expected hash of extraction queries
    /// @param _expectedUrlPattern Expected GitHub API URL pattern
    constructor(
        address _verifier,
        bytes32 _expectedNotaryKeyFingerprint,
        bytes32 _expectedQueriesHash,
        string memory _expectedUrlPattern
    ) {
        VERIFIER = IRiscZeroVerifier(_verifier);
        EXPECTED_NOTARY_KEY_FINGERPRINT = _expectedNotaryKeyFingerprint;
        EXPECTED_QUERIES_HASH = _expectedQueriesHash;
        expectedUrlPattern = _expectedUrlPattern;
    }

    /// @notice Submit and verify a GitHub contribution proof
    /// @param journalData Encoded proof data containing public outputs
    /// @param seal ZK proof seal for verification
    /// @dev Journal data should be abi.encoded as: (notaryKeyFingerprint, url, timestamp, queriesHash, username, contributions)
    function submitContribution(
        bytes calldata journalData,
        bytes calldata seal
    ) external {
        // Decode the journal data
        (
            bytes32 notaryKeyFingerprint,
            string memory url,
            uint256 timestamp,
            bytes32 queriesHash,
            string memory username,
            uint256 contributions
        ) = abi.decode(journalData, (bytes32, string, uint256, bytes32, string, uint256));

        // Validate notary key fingerprint
        if (notaryKeyFingerprint != EXPECTED_NOTARY_KEY_FINGERPRINT) {
            revert InvalidNotaryKeyFingerprint();
        }

        // Validate queries hash
        if (queriesHash != EXPECTED_QUERIES_HASH) {
            revert InvalidQueriesHash();
        }

        // Validate URL contains expected pattern
        if (!_containsSubstring(url, expectedUrlPattern)) {
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

        // Store the contribution record
        ContributionRecord memory record = ContributionRecord({
            username: username,
            contributions: contributions,
            timestamp: timestamp,
            blockNumber: block.number,
            repoUrl: url
        });

        contributionHistory[username].push(record);
        latestContribution[username] = record;
        totalVerifiedContributions++;

        emit ContributionVerified(
            username,
            contributions,
            url,
            timestamp,
            block.number
        );
    }

    /// @notice Get all contribution records for a user
    /// @param username GitHub username
    /// @return Array of contribution records
    function getContributionHistory(string memory username)
        external
        view
        returns (ContributionRecord[] memory)
    {
        return contributionHistory[username];
    }

    /// @notice Get the latest contribution record for a user
    /// @param username GitHub username
    /// @return Latest contribution record
    function getLatestContribution(string memory username)
        external
        view
        returns (ContributionRecord memory)
    {
        return latestContribution[username];
    }

    /// @notice Get total number of records for a user
    /// @param username GitHub username
    /// @return Number of contribution records
    function getContributionCount(string memory username)
        external
        view
        returns (uint256)
    {
        return contributionHistory[username].length;
    }

    /// @notice Helper function to check if a string contains a substring
    /// @param str The string to search in
    /// @param substr The substring to search for
    /// @return bool True if substring is found
    function _containsSubstring(string memory str, string memory substr)
        private
        pure
        returns (bool)
    {
        bytes memory strBytes = bytes(str);
        bytes memory substrBytes = bytes(substr);

        if (substrBytes.length > strBytes.length) {
            return false;
        }

        bool found = false;
        for (uint256 i = 0; i <= strBytes.length - substrBytes.length; i++) {
            bool isMatch = true;
            for (uint256 j = 0; j < substrBytes.length; j++) {
                if (strBytes[i + j] != substrBytes[j]) {
                    isMatch = false;
                    break;
                }
            }
            if (isMatch) {
                found = true;
                break;
            }
        }

        return found;
    }
}
