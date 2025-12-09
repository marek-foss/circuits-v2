const snarkjs = require("snarkjs");
const { runWorker, arrayToHex } = require("../../lib/shared.js");

async function main(args) {
  const result = await snarkjs.zKey.exportVerificationKey(
    args.zkey,
    args.print ? console : undefined
  );

  return JSON.stringify(result);
}

void runWorker.child(main);