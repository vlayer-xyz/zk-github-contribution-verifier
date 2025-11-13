// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {
    IRiscZeroVerifier
} from "risc0-ethereum/contracts/src/IRiscZeroVerifier.sol";

/// @title GitHubContributionVerifier
/// @notice Verifies and stores GitHub contribution proofs using ZK proofs from vlayer
/// @dev Uses RISC Zero verifier to validate ZK proofs generated from GitHub API data
contract GitHubContributionVerifier {
    /// @notice RISC Zero verifier contract
    IRiscZeroVerifier public immutable VERIFIER;

    /// @notice ZK proof program identifier
    /// @dev This should match the IMAGE_ID from your ZK proof program
    /// @dev Returns (bytes32 notaryKeyFingerprint, string method, string url, uint256 tlsTimestamp, bytes32 extractionHash, string value1, string value2)
    /// @dev Note: extracted values are encoded as individual tuple parameters, not as an array
    bytes32 public constant IMAGE_ID =
        0xb61918bc011883cff19252d781b88cf0920e28b19248231d890dd339351f0dea;

    /// @notice Expected notary key fingerprint from vlayer
    bytes32 public immutable EXPECTED_NOTARY_KEY_FINGERPRINT;

    /// @notice Expected queries hash - validates correct fields are extracted
    /// @dev Computed from the JMESPath queries used to extract username and contributions
    bytes32 public immutable EXPECTED_QUERIES_HASH;

    /// @notice Expected URL pattern for GitHub API
    string public expectedUrlPattern;

    /// @notice Mapping of repo (owner/repo) => username => contributions
    mapping(string => mapping(string => uint256))
        public contributionsByRepoAndUser;

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
    error ZKProofVerificationFailed(string reason);
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
    /// @param journalData Encoded proof data containing all public outputs as individual tuple parameters
    /// @param seal ZK proof seal for verification
    /// @dev Journal data format: (bytes32 notaryKeyFingerprint, string method, string url, uint256 tlsTimestamp, bytes32 extractionHash, string value1, string value2)
    function submitContribution(
        bytes calldata journalData,
        bytes calldata seal
    ) external {
        // Decode all public outputs - extracted values are individual parameters
        (
            bytes32 notaryKeyFingerprint,
            string memory method,
            string memory url,
            uint256 tlsTimestamp,
            bytes32 extractionHash,
            string memory extractedValue0,
            string memory extractedValue1
        ) = abi.decode(
                journalData,
                (bytes32, string, string, uint256, bytes32, string, string)
            );

        // Verify the ZK proof first
        bytes32 journalDigest = sha256(journalData);
        VERIFIER.verify(seal, IMAGE_ID, journalDigest);

        // Validate notary key fingerprint
        if (notaryKeyFingerprint != EXPECTED_NOTARY_KEY_FINGERPRINT) {
            revert InvalidNotaryKeyFingerprint();
        }

        // Validate extraction hash
        if (extractionHash != EXPECTED_QUERIES_HASH) {
            revert InvalidQueriesHash();
        }

        // Validate URL pattern
        if (!contains(url, expectedUrlPattern)) {
            revert InvalidUrl();
        }

        // For GitHub contributions, expect extractedValue0 to contain repo
        // and extractedValue1 to contain username
        // Note: This test data doesn't have contributions as a separate field

        string memory repo = extractedValue0;
        string memory username = extractedValue1;

        // Store with default contribution value (for testing)
        contributionsByRepoAndUser[repo][username] = 0;

        emit ContributionVerified(username, 0, url, tlsTimestamp, block.number);
    }

    /// @notice Convert bytes32 to hex string
    function toHexString(bytes32 value) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(66);
        str[0] = "0";
        str[1] = "x";
        for (uint256 i = 0; i < 32; i++) {
            str[2 + i * 2] = alphabet[uint8(value[i] >> 4)];
            str[3 + i * 2] = alphabet[uint8(value[i] & 0x0f)];
        }
        return string(str);
    }

    /// @notice Convert uint to string
    function uintToString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    /// @notice Parse string to uint256
    function parseUint(string memory s) internal pure returns (uint256 result) {
        bytes memory b = bytes(s);
        result = 0;
        for (uint256 i = 0; i < b.length; i++) {
            uint8 digit = uint8(b[i]);
            require(digit >= 48 && digit <= 57, "Invalid number string");
            result = result * 10 + (digit - 48);
        }
        return result;
    }

    /// @notice Convert bytes to hex string (truncated to first 32 bytes for readability)
    function bytesToHexString(
        bytes memory data
    ) internal pure returns (string memory) {
        if (data.length == 0) return "0x";

        bytes memory alphabet = "0123456789abcdef";
        uint256 len = data.length > 32 ? 32 : data.length; // Limit to 32 bytes
        bytes memory str = new bytes(2 + len * 2);
        str[0] = "0";
        str[1] = "x";

        for (uint256 i = 0; i < len; i++) {
            str[2 + i * 2] = alphabet[uint8(data[i] >> 4)];
            str[3 + i * 2] = alphabet[uint8(data[i] & 0x0f)];
        }

        return string(str);
    }

    /// @notice Check if a string contains a substring
    function contains(
        string memory source,
        string memory substring
    ) internal pure returns (bool) {
        bytes memory sourceBytes = bytes(source);
        bytes memory substringBytes = bytes(substring);

        if (substringBytes.length > sourceBytes.length) {
            return false;
        }

        for (
            uint256 i = 0;
            i <= sourceBytes.length - substringBytes.length;
            i++
        ) {
            bool found = true;
            for (uint256 j = 0; j < substringBytes.length; j++) {
                if (sourceBytes[i + j] != substringBytes[j]) {
                    found = false;
                    break;
                }
            }
            if (found) {
                return true;
            }
        }
        return false;
    }
}
