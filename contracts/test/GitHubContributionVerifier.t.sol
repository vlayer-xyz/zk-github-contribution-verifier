// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {GitHubContributionVerifier} from "../src/GitHubContributionVerifier.sol";

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
        assertEq(verifier.EXPECTED_NOTARY_KEY_FINGERPRINT(), TEST_NOTARY_FINGERPRINT);
        assertEq(verifier.EXPECTED_QUERIES_HASH(), TEST_QUERIES_HASH);
    }

    function testSubmitContributionSuccess() public {
        string memory username = "testuser";
        uint256 contributions = 100;
        string memory url = "https://api.github.com/graphql";
        string memory repoNameWithOwner = "vlayer-xyz/vlayer";
        uint256 timestamp = block.timestamp;

        bytes memory journalData = abi.encode(
            TEST_NOTARY_FINGERPRINT,
            url,
            timestamp,
            TEST_QUERIES_HASH,
            repoNameWithOwner,
            username,
            contributions
        );

        bytes memory seal = "";

        verifier.submitContribution(journalData, seal);

        assertEq(verifier.contributionsByRepoAndUser(repoNameWithOwner, username), contributions);
    }

    function testSubmitMultipleContributions() public {
        string memory username = "testuser";
        string memory repoNameWithOwner = "vlayer-xyz/vlayer";

        for (uint256 i = 1; i <= 3; i++) {
            bytes memory journalData = abi.encode(
                TEST_NOTARY_FINGERPRINT,
                "https://api.github.com/graphql",
                block.timestamp,
                TEST_QUERIES_HASH,
                repoNameWithOwner,
                username,
                i * 100
            );

            verifier.submitContribution(journalData, "");
        }

        assertEq(verifier.contributionsByRepoAndUser(repoNameWithOwner, username), 300);
    }

    function testRevertInvalidNotaryFingerprint() public {
        bytes32 wrongFingerprint = bytes32(uint256(1));

        bytes memory journalData = abi.encode(
            wrongFingerprint,
            "https://api.github.com/graphql",
            block.timestamp,
            TEST_QUERIES_HASH,
            "owner/repo",
            "testuser",
            uint256(100)
        );

        vm.expectRevert(GitHubContributionVerifier.InvalidNotaryKeyFingerprint.selector);
        verifier.submitContribution(journalData, "");
    }

    function testRevertInvalidQueriesHash() public {
        bytes32 wrongHash = bytes32(uint256(1));

        bytes memory journalData = abi.encode(
            TEST_NOTARY_FINGERPRINT,
            "https://api.github.com/graphql",
            block.timestamp,
            wrongHash,
            "owner/repo",
            "testuser",
            uint256(100)
        );

        vm.expectRevert(GitHubContributionVerifier.InvalidQueriesHash.selector);
        verifier.submitContribution(journalData, "");
    }

    function testRevertInvalidUrl() public {
        bytes memory journalData = abi.encode(
            TEST_NOTARY_FINGERPRINT,
            "https://invalid-url.com/test",
            block.timestamp,
            TEST_QUERIES_HASH,
            "owner/repo",
            "testuser",
            uint256(100)
        );

        vm.expectRevert(GitHubContributionVerifier.InvalidUrl.selector);
        verifier.submitContribution(journalData, "");
    }

    function testRevertInvalidContributions() public {
        bytes memory journalData = abi.encode(
            TEST_NOTARY_FINGERPRINT,
            "https://api.github.com/graphql",
            block.timestamp,
            TEST_QUERIES_HASH,
            "owner/repo",
            "testuser",
            uint256(0)
        );

        vm.expectRevert(GitHubContributionVerifier.InvalidContributions.selector);
        verifier.submitContribution(journalData, "");
    }

    function testRevertZKProofVerificationFailed() public {
        mockVerifier.setShouldFail(true);

        bytes memory journalData = abi.encode(
            TEST_NOTARY_FINGERPRINT,
            "https://api.github.com/graphql",
            block.timestamp,
            TEST_QUERIES_HASH,
            "owner/repo",
            "testuser",
            uint256(100)
        );

        vm.expectRevert(GitHubContributionVerifier.ZKProofVerificationFailed.selector);
        verifier.submitContribution(journalData, "");
    }

    function testEmitContributionVerified() public {
        string memory username = "testuser";
        uint256 contributions = 100;
        string memory url = "https://api.github.com/graphql";
        string memory repoNameWithOwner = "vlayer-xyz/vlayer";

        bytes memory journalData = abi.encode(
            TEST_NOTARY_FINGERPRINT,
            url,
            block.timestamp,
            TEST_QUERIES_HASH,
            repoNameWithOwner,
            username,
            contributions
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
}
