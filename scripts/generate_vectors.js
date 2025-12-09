#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { poseidon, eddsa, babyjub } = require("circomlibjs");
const circuitConfigs = require("../lib/circuitConfigs");
const { circuitConfigToName } = require("../lib/shared");

const OUTPUT_PATH = path.join(__dirname, "../test/vectors.json");
const MERKLE_DEPTH = 16;

const Fp = babyjub.F; // Poseidon runs over the same BN128 field
const Fr = babyjub.F; // babyjub/eddsa field

function randomField(modulus) {
  let v = 0n;
  while (v === 0n) {
    v = BigInt(`0x${randomBytes(32).toString("hex")}`) % modulus;
  }
  return v;
}

function randomPoseidon() {
  return randomField(Fp.p);
}

function randomEdDSA() {
  return randomBytes(32); // eddsa expects a 32-byte private key buffer
}

function toStr(x) {
  return x.toString();
}

function computeRoot(leaf, pathElements) {
  let cur = leaf;
  for (const sibling of pathElements) {
    cur = poseidon([cur, sibling]);
  }
  return cur;
}

function buildTestVector(config) {
  const { nullifiers: nInputs, commitments: nOutputs } = config;
  const leafIndex = 0n; // simple path (all bits zero)

  const token = randomPoseidon();
  const boundParamsHash = randomPoseidon();
  const nullifyingKey = randomPoseidon();

  const privKey = randomEdDSA();
  const pubKey = eddsa.prv2pub(privKey);
  const publicKey = [Fr.toObject(pubKey[0]), Fr.toObject(pubKey[1])];

  const mpk = poseidon([
    BigInt(publicKey[0]),
    BigInt(publicKey[1]),
    nullifyingKey,
  ]);

  // Use the same note parameters across inputs to keep a shared Merkle root.
  const randomInVal = randomPoseidon();
  const valueInVal = 1000n; // < 2^120
  const customPointerVal = randomPoseidon();

  const randomIn = Array.from({ length: nInputs }, () => randomInVal);
  const valueIn = Array.from({ length: nInputs }, () => valueInVal);
  const customPointer = Array.from(
    { length: nInputs },
    () => customPointerVal
  );

  const npkIn = randomIn.map((rand) => poseidon([mpk, rand]));
  const noteCommitment = poseidon([
    npkIn[0],
    token,
    valueInVal,
    customPointerVal,
  ]);

  const pathElements = Array.from({ length: MERKLE_DEPTH }, randomPoseidon);
  const merkleRoot = computeRoot(noteCommitment, pathElements);

  const nullifier = poseidon([nullifyingKey, leafIndex]);
  const nullifiers = Array.from({ length: nInputs }, () => nullifier);
  const leavesIndices = Array.from({ length: nInputs }, () => leafIndex);
  const pathElementsAll = Array.from(
    { length: nInputs },
    () => pathElements
  );

  const sumIn = valueInVal * BigInt(nInputs);
  const valueOut = [
    sumIn,
    ...Array.from({ length: Math.max(0, nOutputs - 1) }, () => 0n),
  ];

  const npkOut = Array.from({ length: nOutputs }, randomPoseidon);
  const commitmentsOut = npkOut.map((npk, i) =>
    poseidon([npk, token, valueOut[i]])
  );

  const message = poseidon([
    merkleRoot,
    boundParamsHash,
    ...nullifiers,
    ...commitmentsOut,
  ]);
  const signature = eddsa.signPoseidon(privKey, message);

  return {
    merkleRoot: toStr(merkleRoot),
    boundParamsHash: toStr(boundParamsHash),
    nullifiers: nullifiers.map(toStr),
    commitmentsOut: commitmentsOut.map(toStr),
    token: toStr(token),
    publicKey: publicKey.map((x) => toStr(BigInt(x))),
    signature: [
      toStr(Fr.toObject(signature.R8[0])),
      toStr(Fr.toObject(signature.R8[1])),
      toStr(signature.S),
    ],
    randomIn: randomIn.map(toStr),
    valueIn: valueIn.map(toStr),
    pathElements: pathElementsAll.map((pe) => pe.map(toStr)),
    leavesIndices: leavesIndices.map(toStr),
    nullifyingKey: toStr(nullifyingKey),
    npkOut: npkOut.map(toStr),
    valueOut: valueOut.map(toStr),
    customPointer: customPointer.map(toStr),
  };
}

async function main() {
  const testInputs = {};

  for (const config of circuitConfigs) {
    const name = circuitConfigToName(config);
    testInputs[name] = buildTestVector(config);
  }

  const content = JSON.stringify({ testInputs }, null, 2);
  await fs.writeFile(OUTPUT_PATH, content);
  console.log(`Wrote vectors to ${OUTPUT_PATH}`);
}

void main();
