// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {GitHubContributionVerifier} from "../src/GitHubContributionVerifier.sol";
import {RiscZeroMockVerifier} from "risc0-ethereum/contracts/src/test/RiscZeroMockVerifier.sol";

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

    bytes32 constant TEST_IMAGE_ID =
        0x0000000000000000000000000000000000000000000000000000000000000000;
    bytes32 constant TEST_NOTARY_FINGERPRINT =
        0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef;
    bytes32 constant TEST_QUERIES_HASH =
        0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890;
    string constant TEST_URL_PATTERN = "https://api.github.com/graphql";

    function setUp() public {
        mockVerifier = new MockVerifier();
        verifier = new GitHubContributionVerifier(
            address(mockVerifier),
            TEST_IMAGE_ID,
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
                "POST",
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
            "POST",
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
            "POST",
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
            "POST",
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
            "POST",
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
            "POST",
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
        string memory method = "POST";
        string memory url = "https://api.github.com/graphql";
        string memory repoNameWithOwner = "vlayer-xyz/vlayer";

        bytes memory journalData = abi.encode(
            TEST_NOTARY_FINGERPRINT,
            method,
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

    function testRealZKProofData() public {
        bytes4 mockSelector = bytes4(0xFFFFFFFF);
        RiscZeroMockVerifier riscZeroMock = new RiscZeroMockVerifier(mockSelector);

        bytes32 EXPECTED_NOTARY_FINGERPRINT = 0xa7e62d7f17aa7a22c26bdb93b7ce9400e826ffb2c6f54e54d2ded015677499af;
        bytes32 EXPECTED_EXTRACTION_HASH = 0x85db70a06280c1096181df15a8c754a968a0eb669b34d686194ce1faceb5c6c6;
        bytes32 EXPECTED_IMAGE_ID = 0xb61918bc011883cff19252d781b88cf0920e28b19248231d890dd339351f0dea;

        GitHubContributionVerifier realVerifier = new GitHubContributionVerifier(
            address(riscZeroMock),
            EXPECTED_IMAGE_ID,
            EXPECTED_NOTARY_FINGERPRINT,
            EXPECTED_EXTRACTION_HASH,
            "https://api.github.com/graphql" 
        );

        bytes memory journalDataAbi = hex"a7e62d7f17aa7a22c26bdb93b7ce9400e826ffb2c6f54e54d2ded015677499af00000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000140000000000000000000000000000000000000000000000000000000006915f2bb85db70a06280c1096181df15a8c754a968a0eb669b34d686194ce1faceb5c6c6000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000001c000000000000000000000000000000000000000000000000000000000000000950000000000000000000000000000000000000000000000000000000000000004504f535400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001e68747470733a2f2f6170692e6769746875622e636f6d2f6772617068716c00000000000000000000000000000000000000000000000000000000000000000011766c617965722d78797a2f766c61796572000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a7767726f6d6e69616b3200000000000000000000000000000000000000000000";
        bytes memory seal = hex"ffffffff742b9a5379c32a375a5df215a8ae7841af0c792c20e44f2923de268f362f66e2";

        realVerifier.submitContribution(journalDataAbi, seal);

        assertEq(realVerifier.contributionsByRepoAndUser("vlayer-xyz/vlayer", "wgromniak2"), 149);
    }
}
