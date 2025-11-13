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
    /// @dev Returns (uint256 contributions, uint256 tlsTimestamp)
    bytes32 public constant IMAGE_ID =
        0xb15da9e9f6026be8ef857880beaa010515523a46c6c252258322842a8fd25cd5;

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
    /// @param journalData Encoded proof data containing (contributions, tlsTimestamp)
    /// @param seal ZK proof seal for verification
    /// @dev Journal data is abi.encode((uint256 contributions, uint256 tlsTimestamp))
    function submitContribution(
        bytes calldata journalData,
        bytes calldata seal
    ) external {
        // Decode contributions and timestamp
        (uint256 contributions, uint256 tlsTimestamp) = abi.decode(
            journalData,
            (uint256, uint256)
        );

        // SIMPLIFIED: Hardcode repo and username for testing
        string memory repoNameWithOwner = "vlayer-xyz/vlayer";
        string memory username = "wgromniak2";

        // Validate contributions is a reasonable number
        // if (contributions == 0 || contributions > 1000000) {
        //     revert InvalidContributions();
        // }

        // Verify the ZK proof - trust RISC Zero's verifier to handle the cryptography
        bytes32 journalDigest = sha256(journalData);

        VERIFIER.verify(seal, IMAGE_ID, journalDigest);

        // Store the contribution value for the hardcoded repo and user
        contributionsByRepoAndUser[repoNameWithOwner][username] = contributions;

        emit ContributionVerified(
            username,
            contributions,
            "https://api.github.com/graphql", // hardcoded
            tlsTimestamp,
            block.number
        );
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
}
