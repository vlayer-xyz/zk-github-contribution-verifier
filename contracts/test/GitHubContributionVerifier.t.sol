// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {
    GitHubContributionVerifier
} from "../src/GitHubContributionVerifier.sol";
import {
    RiscZeroMockVerifier
} from "risc0-ethereum/contracts/src/test/RiscZeroMockVerifier.sol";

contract MockVerifier {
    bool public shouldFail;

    function setShouldFail(bool _shouldFail) external {
        shouldFail = _shouldFail;
    }

    function verify(bytes calldata, bytes32, bytes32) external view {
        require(!shouldFail, "Verification failed");
    }
}

contract GitHubContributionVerifierTest is Test {
    GitHubContributionVerifier public verifier;
    MockVerifier public mockVerifier;

    bytes32 constant TEST_NOTARY_FINGERPRINT =
        0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef;
    bytes32 constant TEST_QUERIES_HASH =
        0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890;
    string constant TEST_URL_PATTERN = "https://api.github.com/graphql";

    function setUp() public {
        mockVerifier = new MockVerifier();
        verifier = new GitHubContributionVerifier(
            address(mockVerifier),
            TEST_NOTARY_FINGERPRINT,
            TEST_QUERIES_HASH,
            TEST_URL_PATTERN
        );
    }

    function testConstructor() public view {
        assertEq(address(verifier.VERIFIER()), address(mockVerifier));
        assertEq(
            verifier.EXPECTED_NOTARY_KEY_FINGERPRINT(),
            TEST_NOTARY_FINGERPRINT
        );
        assertEq(verifier.EXPECTED_QUERIES_HASH(), TEST_QUERIES_HASH);
    }

    function testSubmitContributionSuccess() public {
        string memory username = "testuser";
        uint256 contributions = 100;
        string memory method = "POST";
        string memory url = "https://api.github.com/graphql";
        string memory repoNameWithOwner = "vlayer-xyz/vlayer";
        uint256 timestamp = block.timestamp;

        bytes memory journalData = abi.encode(
            TEST_NOTARY_FINGERPRINT,
            method,
            url,
            timestamp,
            TEST_QUERIES_HASH,
            vm.toString(contributions), // extractedValue0
            username // extractedValue1
        );

        bytes memory seal = "";

        verifier.submitContribution(journalData, seal);

        assertEq(
            verifier.contributionsByRepoAndUser(repoNameWithOwner, username),
            contributions
        );
    }

    function testSubmitMultipleContributions() public {
        string memory username = "testuser";
        string memory repoNameWithOwner = "vlayer-xyz/vlayer";

        for (uint256 i = 1; i <= 3; i++) {
            string[] memory extractedValues = new string[](3);
            extractedValues[0] = repoNameWithOwner;
            extractedValues[1] = username;
            extractedValues[2] = vm.toString(i * 100);

            bytes memory journalData = abi.encode(
                TEST_NOTARY_FINGERPRINT,
                "https://api.github.com/graphql",
                block.timestamp,
                TEST_QUERIES_HASH,
                extractedValues
            );

            verifier.submitContribution(journalData, "");
        }

        assertEq(
            verifier.contributionsByRepoAndUser(repoNameWithOwner, username),
            300
        );
    }

    function testRevertInvalidNotaryFingerprint() public {
        bytes32 wrongFingerprint = bytes32(uint256(1));

        string[] memory extractedValues = new string[](3);
        extractedValues[0] = "owner/repo";
        extractedValues[1] = "testuser";
        extractedValues[2] = "100";

        bytes memory journalData = abi.encode(
            wrongFingerprint,
            "https://api.github.com/graphql",
            block.timestamp,
            TEST_QUERIES_HASH,
            extractedValues
        );

        vm.expectRevert(
            GitHubContributionVerifier.InvalidNotaryKeyFingerprint.selector
        );
        verifier.submitContribution(journalData, "");
    }

    function testRevertInvalidQueriesHash() public {
        bytes32 wrongHash = bytes32(uint256(1));

        string[] memory extractedValues = new string[](3);
        extractedValues[0] = "owner/repo";
        extractedValues[1] = "testuser";
        extractedValues[2] = "100";

        bytes memory journalData = abi.encode(
            TEST_NOTARY_FINGERPRINT,
            "https://api.github.com/graphql",
            block.timestamp,
            wrongHash,
            extractedValues
        );

        vm.expectRevert(GitHubContributionVerifier.InvalidQueriesHash.selector);
        verifier.submitContribution(journalData, "");
    }

    function testRevertInvalidUrl() public {
        string[] memory extractedValues = new string[](3);
        extractedValues[0] = "owner/repo";
        extractedValues[1] = "testuser";
        extractedValues[2] = "100";

        bytes memory journalData = abi.encode(
            TEST_NOTARY_FINGERPRINT,
            "https://invalid-url.com/test",
            block.timestamp,
            TEST_QUERIES_HASH,
            extractedValues
        );

        vm.expectRevert(GitHubContributionVerifier.InvalidUrl.selector);
        verifier.submitContribution(journalData, "");
    }

    function testRevertInvalidContributions() public {
        string[] memory extractedValues = new string[](3);
        extractedValues[0] = "owner/repo";
        extractedValues[1] = "testuser";
        extractedValues[2] = "0";

        bytes memory journalData = abi.encode(
            TEST_NOTARY_FINGERPRINT,
            "https://api.github.com/graphql",
            block.timestamp,
            TEST_QUERIES_HASH,
            extractedValues
        );

        vm.expectRevert(
            GitHubContributionVerifier.InvalidContributions.selector
        );
        verifier.submitContribution(journalData, "");
    }

    function testRevertZKProofVerificationFailed() public {
        mockVerifier.setShouldFail(true);

        string[] memory extractedValues = new string[](3);
        extractedValues[0] = "owner/repo";
        extractedValues[1] = "testuser";
        extractedValues[2] = "100";

        bytes memory journalData = abi.encode(
            TEST_NOTARY_FINGERPRINT,
            "https://api.github.com/graphql",
            block.timestamp,
            TEST_QUERIES_HASH,
            extractedValues
        );

        vm.expectRevert(
            GitHubContributionVerifier.ZKProofVerificationFailed.selector
        );
        verifier.submitContribution(journalData, "");
    }

    function testEmitContributionVerified() public {
        string memory username = "testuser";
        uint256 contributions = 100;
        string memory url = "https://api.github.com/graphql";
        string memory repoNameWithOwner = "vlayer-xyz/vlayer";

        string[] memory extractedValues = new string[](3);
        extractedValues[0] = repoNameWithOwner;
        extractedValues[1] = username;
        extractedValues[2] = vm.toString(contributions);

        bytes memory journalData = abi.encode(
            TEST_NOTARY_FINGERPRINT,
            url,
            block.timestamp,
            TEST_QUERIES_HASH,
            extractedValues
        );

        vm.expectEmit(true, false, false, false);
        emit GitHubContributionVerifier.ContributionVerified(
            username,
            contributions,
            url,
            block.timestamp,
            block.number
        );

        verifier.submitContribution(journalData, "");
    }

    /// @notice Debug test to decode the journal data and see what's inside
    function testDecodeRealJournalData() public view {
        // Real values from zk-prover-server
        bytes
            memory journalDataAbi = hex"0000000000000000000000000000000000000000000000000000000000000020a7e62d7f17aa7a22c26bdb93b7ce9400e826ffb2c6f54e54d2ded015677499af00000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000006914e8eb85db70a06280c1096181df15a8c754a968a0eb669b34d686194ce1faceb5c6c600000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000001e68747470733a2f2f6170692e6769746875622e636f6d2f6772617068716c00000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000001322766c617965722d78797a2f766c617965722200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c227767726f6d6e69616b3222000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000033134390000000000000000000000000000000000000000000000000000000000";

        console.log("=== RAW JOURNAL DATA ===");
        console.log("Length:", journalDataAbi.length);

        // Try to decode as bytes first (in case it's double-encoded)
        try this.tryDecodeAsBytes(journalDataAbi) {
            console.log("Successfully decoded as bytes wrapper");
        } catch {
            console.log("NOT encoded as bytes wrapper");
        }
        // Try direct decode
        try this.tryDecodeDirectly(journalDataAbi) {
            console.log("Successfully decoded directly");
        } catch {
            console.log("FAILED to decode directly");
        }
    }

    function tryDecodeAsBytes(bytes memory data) external view {
        bytes memory innerData = abi.decode(data, (bytes));
        console.log("Inner data length:", innerData.length);

        (
            bytes32 notaryKeyFingerprint,
            string memory url,
            uint256 timestamp,
            bytes32 queriesHash,
            string[] memory extractedValues
        ) = abi.decode(
                innerData,
                (bytes32, string, uint256, bytes32, string[])
            );

        console.log("=== DECODED (from bytes wrapper) ===");
        console.log("Notary Key Fingerprint:");
        console.logBytes32(notaryKeyFingerprint);
        console.log("URL:", url);
        console.log("Timestamp:", timestamp);
        console.log("Queries Hash:");
        console.logBytes32(queriesHash);
        console.log("Extracted Values Length:", extractedValues.length);
        for (uint i = 0; i < extractedValues.length; i++) {
            console.log("  [", i, "]:", extractedValues[i]);
        }
    }

    function tryDecodeDirectly(bytes memory data) external view {
        (
            bytes32 notaryKeyFingerprint,
            string memory url,
            uint256 timestamp,
            bytes32 queriesHash,
            string[] memory extractedValues
        ) = abi.decode(data, (bytes32, string, uint256, bytes32, string[]));

        console.log("=== DECODED (directly) ===");
        console.log("Notary Key Fingerprint:");
        console.logBytes32(notaryKeyFingerprint);
        console.log("URL:", url);
        console.log("Timestamp:", timestamp);
        console.log("Queries Hash:");
        console.logBytes32(queriesHash);
        console.log("Extracted Values Length:", extractedValues.length);
        for (uint i = 0; i < extractedValues.length; i++) {
            console.log("  [", i, "]:", extractedValues[i]);
        }
    }

    /// @notice Test with REAL values from zk-prover-server using RiscZeroMockVerifier
    /// @dev Journal contains all public outputs: (bytes32, string, string, uint256, bytes32, string, string)
    function testRealZKProofData() public {
        bytes4 mockSelector = bytes4(0xFFFFFFFF); // Mock selector for fake receipt
        RiscZeroMockVerifier riscZeroMock = new RiscZeroMockVerifier(
            mockSelector
        );

        // Expected values from web_proof.json (GitHub API test data)
        bytes32 EXPECTED_NOTARY_FINGERPRINT = 0xa7e62d7f17aa7a22c26bdb93b7ce9400e826ffb2c6f54e54d2ded015677499af;
        bytes32 EXPECTED_EXTRACTION_HASH = 0x85db70a06280c1096181df15a8c754a968a0eb669b34d686194ce1faceb5c6c6;

        GitHubContributionVerifier realVerifier = new GitHubContributionVerifier(
                address(riscZeroMock),
                EXPECTED_NOTARY_FINGERPRINT,
                EXPECTED_EXTRACTION_HASH,
                "api.github.com" // URL pattern for GitHub API
            );

        // Real values from zk-prover-server - full PublicOutputs tuple with individual extracted values
        bytes
            memory journalDataAbi = hex"a7e62d7f17aa7a22c26bdb93b7ce9400e826ffb2c6f54e54d2ded015677499af00000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000006915f2bb85db70a06280c1096181df15a8c754a968a0eb669b34d686194ce1faceb5c6c6000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000001c000000000000000000000000000000000000000000000000000000000000000950000000000000000000000000000000000000000000000000000000000000004504f535400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001e68747470733a2f2f6170692e6769746875622e636f6d2f6772617068716c00000000000000000000000000000000000000000000000000000000000000000011766c617965722d78797a2f766c61796572000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a7767726f6d6e69616b3200000000000000000000000000000000000000000000";
        bytes
            memory seal = hex"ffffffff742b9a5379c32a375a5df215a8ae7841af0c792c20e44f2923de268f362f66e2";

        console.log("Journal data length:", journalDataAbi.length);
        console.log("Seal length:", seal.length);

        // Decode to verify structure - extracted values are individual parameters
        (
            bytes32 notaryKeyFingerprint,
            string memory method,
            string memory url,
            uint256 tlsTimestamp,
            bytes32 extractionHash,
            string memory extractedValue0,
            string memory extractedValue1
        ) = abi.decode(
                journalDataAbi,
                (bytes32, string, string, uint256, bytes32, string, string)
            );

        console.log("Notary Key Fingerprint:");
        console.logBytes32(notaryKeyFingerprint);
        console.log("Method:", method);
        console.log("URL:", url);
        console.log("TLS Timestamp:", tlsTimestamp);
        console.log("Extraction Hash:");
        console.logBytes32(extractionHash);
        console.log("Extracted Values:");
        console.log("  [0]:", extractedValue0);
        console.log("  [1]:", extractedValue1);
        console.log("Submitting to contract...");

        // Submit to contract - should verify ZK proof
        realVerifier.submitContribution(journalDataAbi, seal);

        console.log("Submission successful!");

        // This test uses real GitHub API data with:
        // - extractedValue0: "vlayer-xyz/vlayer" (repo)
        // - extractedValue1: "wgromniak2" (username)
    }
}
