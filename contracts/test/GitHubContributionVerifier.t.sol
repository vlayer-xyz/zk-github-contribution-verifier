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
        string memory url = "https://api.github.com/graphql";
        string memory repoNameWithOwner = "vlayer-xyz/vlayer";
        uint256 timestamp = block.timestamp;

        string[] memory extractedValues = new string[](3);
        extractedValues[0] = repoNameWithOwner;
        extractedValues[1] = username;
        extractedValues[2] = vm.toString(contributions);

        bytes memory journalData = abi.encode(
            TEST_NOTARY_FINGERPRINT,
            url,
            timestamp,
            TEST_QUERIES_HASH,
            extractedValues
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
    /// @dev Journal contains (uint256 contributions, uint256 tlsTimestamp)
    function testRealZKProofData() public {
        bytes4 mockSelector = bytes4(0xFFFFFFFF); // Mock selector for fake receipt
        RiscZeroMockVerifier riscZeroMock = new RiscZeroMockVerifier(
            mockSelector
        );

        // Use dummy values since simplified contract doesn't validate these
        bytes32 DUMMY_NOTARY_FINGERPRINT = bytes32(0);
        bytes32 DUMMY_QUERIES_HASH = bytes32(0);

        GitHubContributionVerifier realVerifier = new GitHubContributionVerifier(
                address(riscZeroMock),
                DUMMY_NOTARY_FINGERPRINT,
                DUMMY_QUERIES_HASH,
                TEST_URL_PATTERN
            );

        // Real values from zk-prover-server - (uint256 contributions, uint256 tlsTimestamp)
        bytes
            memory journalDataAbi = hex"0000000000000000000000000000000000000000000000000000000000000095000000000000000000000000000000000000000000000000000000006901a78f";
        bytes
            memory seal = hex"ffffffff55ee910ff1925bf9255d8e93eee1d9569d1ac89a7535bb84d54bd6505817ca03";

        console.log("Journal data length:", journalDataAbi.length);
        console.log("Seal length:", seal.length);
        (uint256 contributions, uint256 tlsTimestamp) = abi.decode(
            journalDataAbi,
            (uint256, uint256)
        );
        console.log("Journal data (contributions):", contributions);
        console.log("Journal data (tlsTimestamp):", tlsTimestamp);
        console.log("Submitting to contract...");

        // Submit to contract - should verify and store
        realVerifier.submitContribution(journalDataAbi, seal);

        console.log("Submission successful!");

        // Verify the data was stored correctly
        // Contract hardcodes: repo="vlayer-xyz/vlayer", username="wgromniak2"
        assertEq(
            realVerifier.contributionsByRepoAndUser(
                "vlayer-xyz/vlayer",
                "wgromniak2"
            ),
            149,
            "Contributions should be stored correctly"
        );
    }
}
