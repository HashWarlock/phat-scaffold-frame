// *** YOU ARE LIMITED TO THE FOLLOWING IMPORTS TO BUILD YOUR PHAT CONTRACT     ***
// *** ADDING ANY IMPORTS WILL RESULT IN ERRORS & UPLOADING YOUR CODE TO PHALA  ***
// *** NETWORK WILL FAIL. IF YOU WANT TO KNOW MORE, JOIN OUR DISCORD TO SPEAK   ***
// *** WITH THE PHALA TEAM AT https://discord.gg/5HfmWQNX THANK YOU             ***
import "@phala/pink-env";
import { vrf } from "@phala/pink-env";
import { encodeAbiParameters, decodeAbiParameters, parseAbiParameters } from "viem";

type HexString = `0x${string}`;

// Defined in ../contracts/VRFOracle.sol
const requestAbiParams = 'uint256 id, string seed, uint32 numWords';
const replyAbiParams = 'uint respType, uint256 id, uint256[] data';

function decodeRequest(request: HexString): readonly [bigint, string, number] {
    return decodeAbiParameters(parseAbiParameters(requestAbiParams), request);
}

function encodeReply(reply: [bigint, bigint, bigint[]]): HexString {
    return encodeAbiParameters(parseAbiParameters(replyAbiParams), reply);
}

// Defined in ../contracts/VRFOracle.sol
const TYPE_RESPONSE = 0n;
const TYPE_ERROR = 2n;

enum Error {
    BadRequestString = "BadRequestString",
    BadVrf = "BadVrf",
    FailedToDecode = "FailedToDecode",
    MalformedRequest = "MalformedRequest",
}

function errorToCode(error: Error): number {
    switch (error) {
        case Error.BadRequestString:
            return 1;
        case Error.BadVrf:
            return 2;
        case Error.FailedToDecode:
            return 3;
        case Error.MalformedRequest:
            return 4;
        default:
            return 0;
    }
}

function getRandomWords(nonce: string, numWords: number): bigint[] {
    let randomWords = [];
    for (let i = 0; i < numWords; i++) {
        const randomBytes = vrf(nonce + i);
        if (randomBytes.byteLength != 64) {
            throw Error.BadVrf;
        }
        const dv = new DataView(randomBytes.buffer, randomBytes.byteOffset, randomBytes.byteLength);
        randomWords.push(dv.getBigUint64(0));
    }
    return randomWords;
}

//
// Here is what you need to implemented for Phat Contract, you can customize your logic with
// JavaScript here.
//
// The Phat Contract will be called with two parameters:
//
// - request: The raw payload from the contract call `request` (check the `request` function in TestLensApiConsumerConract.sol).
//            In this example, it's a tuple of two elements: [requestId, profileId]
// - secrets: The custom secrets you set with the `config_core` function of the Action Offchain Rollup Phat Contract. In
//            this example, it just a simple text of the lens api url prefix. For more information on secrets, checkout the SECRETS.md file.
//
// Your returns value MUST be a hex string, and it will send to your contract directly. Check the `_onMessageReceived` function in
// OracleConsumerContract.sol for more details. We suggest a tuple of three elements: [successOrNotFlag, requestId, data] as
// the return value.
//
export default function main(request: HexString, secrets: string): HexString {
    console.log(`Handle req: ${request}`);
    // Uncomment to debug the `settings` passed in from the Phat Contract UI configuration.
    // console.log(`secrets: ${settings}`);
    let requestId, nonce, numWords;
    try {
        [requestId, nonce, numWords] = decodeRequest(request);
    } catch (error) {
        console.info("Malformed request received");
        return encodeReply([TYPE_ERROR, 0n, [BigInt(errorToCode(error as Error))]]);
    }
    console.log(`Request received for nonce "${nonce}", length ${numWords}`);

    try {
        let randomWords = getRandomWords(nonce, numWords);
        console.log("Response:", [TYPE_RESPONSE, requestId, randomWords]);
        return encodeReply([TYPE_RESPONSE, requestId, randomWords]);
    } catch (error) {
        // tell client we cannot process it
        console.log("error:", [TYPE_ERROR, requestId, error]);
        return encodeReply([TYPE_ERROR, requestId, [BigInt(errorToCode(error as Error))]]);
    }
}
