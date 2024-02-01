// *** YOU ARE LIMITED TO THE FOLLOWING IMPORTS TO BUILD YOUR PHAT CONTRACT     ***
// *** ADDING ANY IMPORTS WILL RESULT IN ERRORS & UPLOADING YOUR CODE TO PHALA  ***
// *** NETWORK WILL FAIL. IF YOU WANT TO KNOW MORE, JOIN OUR DISCORD TO SPEAK   ***
// *** WITH THE PHALA TEAM AT https://discord.gg/5HfmWQNX THANK YOU             ***
import "@phala/pink-env";
import { vrf } from "@phala/pink-env";
import { encodeAbiParameters, decodeAbiParameters, parseAbiParameters } from "viem";

type HexString = `0x${string}`;

// Defined in ../contracts/VRFOracle.sol
const requestAbiParams = 'uint256 id, string frameMessageBytes, uint256 randomWord';
const replyAbiParams = 'uint respType, uint256 id, string base64EncSvg';

function decodeRequest(request: HexString): readonly [bigint, string, number] {
  return decodeAbiParameters(parseAbiParameters(requestAbiParams), request);
}

function encodeReply(reply: [bigint, bigint, bigint[]]): HexString {
  return encodeAbiParameters(parseAbiParameters(replyAbiParams), reply);
}

// Defined in ../contracts/VRFOracle.sol
const TYPE_RESPONSE = 0n;
const TYPE_ERROR = 2n;

function stringToHex(str: string): string {
  var hex = "";
  for (var i = 0; i < str.length; i++) {
    hex += str.charCodeAt(i).toString(16);
  }
  return "0x" + hex;
}

enum Error {
  BadRequestString = "BadRequestString",
  BadVrf = "BadVrf",
  FailedToDecode = "FailedToDecode",
  MalformedRequest = "MalformedRequest",
  FailedToFetchData = "FailedToFetchData",
  FailedToValidateFrame = "FailedToValidateFrame",
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
    case Error.FailedToFetchData:
      return 5;
    case Error.FailedToValidateFrame:
      return 6;
    default:
      return 0;
  }
}

function getResponseBody(response: any) {
  if (response.statusCode !== 200) {
    console.log(`Fail to read api with status code: ${response.statusCode}, error: ${response.error || response.body}}`);
    throw Error.FailedToFetchData;
  }
  if (typeof response.body !== "string") {
    throw Error.FailedToDecode;
  }
  console.log(response.body);
  return JSON.parse(response.body)
}

function validateFrameAction(messageBytesInHex: string) {
  let headers = {
    "content-type": "application/json",
    "accept": "application/json",
    "api_key": "",
  };
  const bodyJSON = JSON.stringify({
    "message_bytes_in_hex": `${messageBytesInHex}`
  });
  const body = stringToHex(bodyJSON);
  try {
    const response = pink.httpRequest({
      url: "https://api.neynar.com/v2/farcaster/frame/validate",
      method: "POST",
      headers,
      body,
      returnTextBody: true,
    });
    console.log(response.body);
  } catch (err) {
    console.log("Some error occurred:", err);
  }
}

function fetchAirstackApiInfo(apiUrl: string, apiKey: string, frameActor: string): any {
  let headers = {
    "Content-Type": "application/json",
    "User-Agent": "phat-contract",
    "Authorization": `${apiKey}`
  };
  const isFollowingTheGoat = JSON.stringify({ query: `
    query isFollowing { Wallet(input: {identity: "${frameActor}", blockchain: ethereum}) { socialFollowers( input: {filter: {identity: {_in: ["fc_fid:12470"]}, dappName: {_eq: farcaster}}}) { Follower { dappName dappSlug followingProfileId followerProfileId followingAddress { addresses socials { dappName profileName } domains { name } } } } } }
  `});
  try {
    const response = pink.httpRequest({
      url: apiUrl,
      method: "POST",
      headers,
      body: stringToHex(isFollowingTheGoat),
      returnTextBody: true,
    });
    const respBody = getResponseBody(response);
    return !!(respBody.data?.Wallet.socialFollowers.Follower ?? false);
  } catch (err) {
    console.log("Some error occurred:", err);
    return false;
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

function postRandomWordToWarpcast(apiKey: string, signer: string,randomWords: bigint) {
  const notSoLuckyUrl = "https://warpcast.com/hub/0xfeb9ee7b";
  const slapUrl = "https://warpcast.com/hub/0xb71af14d";

  let headers = {
    "content-type": "application/json",
    "accept": "application/json",
    "api_key": `${apiKey}`,
  };
  const slapBodyJson = JSON.stringify({
    "signer_uuid": `${signer}`,
    "text": ``
  })
  const bodyJSON = JSON.stringify({
    "signer_uuid": `${signer}`,
    "text": ``
  });
  const body = stringToHex(bodyJSON);
  try {
    const response = pink.httpRequest({
      url: "https://api.neynar.com/v2/farcaster/cast",
      method: "POST",
      headers,
      body,
      returnTextBody: true,
    });
    console.log(response.body);
  } catch (err) {
    console.log("Some error occurred:", err);
  }
}

function base64Encode(str: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let encoded = '';
  let padding = '';

  // Pad string with zeros to make its length a multiple of 3
  while ((str.length + padding.length) % 3 !== 0) {
    padding += '\0';
  }
  str += padding;

  // Convert string to a binary representation
  const binaryStr = str.split('').map(c => {
    const bin = c.charCodeAt(0).toString(2);
    return '0'.repeat(8 - bin.length) + bin; // Ensure 8-bit binary numbers
  }).join('');

  // Encode binary string in 6-bit chunks
  for (let i = 0; i < binaryStr.length; i += 6) {
    const chunk = binaryStr.slice(i, i + 6);
    const index = parseInt(chunk, 2);
    encoded += chars[index];
  }

  // Add padding to the output
  encoded = encoded.slice(0, encoded.length - padding.length) + '='.repeat(padding.length);

  return encoded;
}

function getRandomNumberInRange(random64ByteNumber: bigint): number {
  const range = 4096n; // The upper limit of the desired range (1 to 4096)
  // Use modulo operation to get a number in the range 0 to 4095
  const randomNumberInRange = Number(random64ByteNumber % range);
  // Add 1 to change the range from 1 to 4096
  return randomNumberInRange + 1;
}

function createSVGWithShapesAndNumber(number: number): string {
  const svg = `
      <svg width="320" height="320" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="green" />
          <circle cx="80" cy="60" r="30" fill="white" />
          <rect x="130" y="30" width="60" height="60" fill="white" />
          <polygon points="240,30 210,90 270,90" fill="white" />
          <text x="160" y="160" font-family="Arial" font-weight="bold" font-size="90" fill="white" 
                text-anchor="middle" alignment-baseline="middle">
              ${number}
          </text>
          <rect x="0" y="220" width="320" height="20" fill="white" />
          <rect x="0" y="260" width="320" height="20" fill="white" />
      </svg>
  `;

  // Minify SVG by removing newlines and spaces between tags
  const minifiedSVG = svg.replace(/\n/g, '').replace(/> +</g, '><').trim();

  // Base64 encode the SVG using the custom base64Encode function
  const base64EncodedSVG = base64Encode(minifiedSVG);
  console.log(base64EncodedSVG)
  return base64EncodedSVG;
}

// Example usage: Generate an SVG with the number 1 and shapes aligned at the top center

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
  let requestId, frameMessageBytes, randomWord;
  try {
    [requestId, frameMessageBytes, randomWord] = decodeRequest(request);
  } catch (error) {
    console.info("Malformed request received");
    return encodeReply([TYPE_ERROR, 0n, [BigInt(errorToCode(error as Error))]]);
  }
  console.log(`Request received for nonce "${nonce}", length ${numWords}`);
  try {
    let randomWords = getRandomWords(nonce, numWords);
    // postRandomWordToWarpcast(randomWords);
    const getNumber = getRandomNumberInRange(randomWords[0])
    createSVGWithShapesAndNumber(getNumber);
    console.log("Response:", [TYPE_RESPONSE, requestId, randomWords]);
    return encodeReply([TYPE_RESPONSE, requestId, randomWords]);
  } catch (error) {
    // tell client we cannot process it
    console.log("error:", [TYPE_ERROR, requestId, error]);
    return encodeReply([TYPE_ERROR, requestId, [BigInt(errorToCode(error as Error))]]);
  }
}
