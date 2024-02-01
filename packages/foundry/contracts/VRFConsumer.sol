// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.9;

import "./VRFOracle.sol";
import "./PhatSquidFrameNft.sol";
import "@phala/solidity/contracts/PhatRollupAnchor.sol";
import "@chainlink/contracts/src/v0.8/vrf/VRFConsumerBaseV2.sol";
import {Ownable} from "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";

contract VRFConsumer is VRFConsumerBaseV2, Ownable, PhatRollupAnchor {
    event ResponseReceived(uint reqId, string reqData, address mintTo, string data);
    event ErrorReceived(uint reqId, string reqData, address mintTo, string errno);
    event RandomReceived(uint256 requestId, string frameMessageBytes, uint256[] random);
    event AuthorizedCallerSet(address indexed minter, bool authorized);

    uint constant TYPE_RESPONSE = 0;
    uint constant TYPE_ERROR = 2;

    struct Request {
        address caller;
        string data;
    }

    mapping(uint => string) requests;
    uint256 nextRequest = 1;

    mapping(address authorizedCaller => bool authorized) public authorizedCallers;
    mapping(string frameMessageBytes => uint256 randomNumber) public validatedFrameMessageBytes;
    address _oracle;
    address _nftContract;
    uint256[] _lastRandom;

    modifier onlyAuthorizedCaller() {
        require(authorizedCallers[msg.sender], "VRFConsumer: Caller must be triggered by PhatSquidFrameNFT");
        _;
    }
    constructor(address oracle, address attestor, address nftContract) VRFConsumerBaseV2(oracle) {
        _oracle = oracle;
        _lastRandom = new uint256[](0);
        _nftContract = nftContract;
        authorizedCaller[0x3a4194dd04c959e860dd724f7075a0eb30b9d6e8] = true;
        _grantRole(PhatRollupAnchor.ATTESTOR_ROLE, phatAttestor);
    }

    function setAttestor(address phatAttestor) onlyOwner {
        _grantRole(PhatRollupAnchor.ATTESTOR_ROLE, phatAttestor);
    }

    function request(string calldata reqData, uint32 numWords) public onlyOwner onlyAuthorizedCaller {
        uint256 id = nextRequest;
        VRFOracleInterface oracle = VRFOracleInterface(_oracle);
        oracle.requestRandomWords(reqData, numWords);
        requests[id] = reqData;
        nextRequest += 1;
    }

    function fulfillRandomWords(uint256 requestId, uint256[] memory randomWords) internal override {
        string memory frameMessageBytes = requests[requestId];
        uint256 randomWord = randomWords[0];
        emit RandomReceived(requestId, frameMessageBytes, randomWords);
        _pushMessage(abi.encode(id, frameMessageBytes, randomWord));
        validatedFrameMessageBytes[frameMessageBytes] = randomWord;
        _lastRandom = randomWords;
    }

    function getLastRandom() public view returns (uint256[] memory) {
        return _lastRandom;
    }

    function setAuthorizedCaller(address minter, bool authorized) public onlyOwner {
        authorizedMinters[minter] = authorized;

        emit AuthorizedMinterSet(minter, authorized);
    }

    function _onMessageReceived(bytes calldata action) internal override {
        // Optional to check length of action
        // require(action.length == 32 * 3, "cannot parse action");
        (uint256 respType, uint256 id, address mintTo, string memory data) = abi.decode(action, (uint256, uint256, address, string));
        if (respType == TYPE_RESPONSE) {
            emit ResponseReceived(id, requests[id], mintTo, data);
            PhatSquidFrameNFT nftContract = PhatSquidFrameNft(_nftContract);
            nftContract.mint(mintTo, data);
            delete requests[id];
        } else if (respType == TYPE_ERROR) {
            emit ErrorReceived(id, requests[id], mintTo, data);
            delete requests[id];
        }
    }
}
