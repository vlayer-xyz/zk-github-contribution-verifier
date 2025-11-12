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
    /// @dev Current value matches the guest program with generic string[] format
    bytes32 public constant IMAGE_ID =
        0x01be2503b0560b210ec953401b3a091ff0295a98aafdc1e3019539a0cb5365f2;

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
    /// @param journalData Encoded proof data containing public outputs
    /// @param seal ZK proof seal for verification
    /// @dev Journal data should be abi.encoded as: (notaryKeyFingerprint, url, timestamp, queriesHash, extractedValues[])
    function submitContribution(
        bytes calldata journalData,
        bytes calldata seal
    ) external {
        // Decode the journal data - generic format with string array
        (
            bytes32 notaryKeyFingerprint,
            string memory url,
            uint256 timestamp,
            bytes32 queriesHash,
            string[] memory extractedValues
        ) = abi.decode(
                journalData,
                (bytes32, string, uint256, bytes32, string[])
            );

        // Extract GitHub-specific fields from the array
        // Expected format: [repoNameWithOwner, username, contributions]
        require(extractedValues.length >= 3, "Invalid extracted values length");
        string memory repoNameWithOwner = extractedValues[0];
        string memory username = extractedValues[1];
        uint256 contributions = parseUint(extractedValues[2]);

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
        bytes32 journalDigest = sha256(journalData);

        // Extract seal details for debugging
        bytes4 receivedSelector = seal.length >= 4
            ? bytes4(seal[:4])
            : bytes4(0);
        // Note: SELECTOR is not part of IRiscZeroVerifier interface, access via low-level call
        (bool success, bytes memory data) = address(VERIFIER).staticcall(
            abi.encodeWithSignature("SELECTOR()")
        );
        bytes4 expectedSelector = success && data.length >= 32
            ? bytes4(data)
            : bytes4(0);

        // Extract received claim digest from seal (seal = selector + claimDigest)
        bytes32 receivedClaimDigest = seal.length >= 36
            ? bytes32(seal[4:36])
            : bytes32(0);

        // Calculate expected claim digest from our IMAGE_ID + journalDigest
        bytes32 expectedClaimDigest = sha256(
            abi.encodePacked(
                hex"01", // TAG_DIGEST
                bytes32(0), // input (unused in ok())
                IMAGE_ID,
                sha256(abi.encodePacked(journalDigest, bytes32(0))) // output digest
            )
        );

        try VERIFIER.verify(seal, IMAGE_ID, journalDigest) {
            // Proof verified successfully
        } catch Error(string memory reason) {
            string memory errorMsg = string.concat(
                "Verification failed: ",
                reason,
                " | Expected IMAGE_ID: ",
                toHexString(IMAGE_ID),
                " | Expected selector: ",
                toHexString(bytes32(expectedSelector)),
                " | Received selector: ",
                toHexString(bytes32(receivedSelector)),
                " | Expected claim digest: ",
                toHexString(expectedClaimDigest),
                " | Received claim digest: ",
                toHexString(receivedClaimDigest),
                " | Journal digest: ",
                toHexString(journalDigest),
                " | Seal length: ",
                uintToString(seal.length),
                " | Seal (first 32b): ",
                bytesToHexString(seal)
            );
            revert ZKProofVerificationFailed(errorMsg);
        } catch (bytes memory lowLevelData) {
            string memory errorMsg = string.concat(
                "Verification failed (low-level)",
                " | Expected IMAGE_ID: ",
                toHexString(IMAGE_ID),
                " | Expected selector: ",
                toHexString(bytes32(expectedSelector)),
                " | Received selector: ",
                toHexString(bytes32(receivedSelector)),
                " | Expected claim digest: ",
                toHexString(expectedClaimDigest),
                " | Received claim digest: ",
                toHexString(receivedClaimDigest),
                " | Journal digest: ",
                toHexString(journalDigest),
                " | Seal length: ",
                uintToString(seal.length),
                " | Seal (first 32b): ",
                bytesToHexString(seal),
                " | Error data: ",
                bytesToHexString(lowLevelData)
            );
            revert ZKProofVerificationFailed(errorMsg);
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
