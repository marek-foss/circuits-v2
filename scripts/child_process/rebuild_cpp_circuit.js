const zlib = require("node:zlib");
const fs = require("node:fs/promises");
const { runWorker } = require("../../lib/shared.js");

async function main(args) {
  const file = await fs.readFile(args.source);

  let data = new TextDecoder().decode(file);

  let result = data.replace(
    `#include "circom.hpp"
#include "calcwit.hpp"`,
    `#include "${args.name}_circom.hpp"
#include "${args.name}_calcwit.hpp"
namespace ${args.name} {`
  );

  result += `}
`;

  await fs.writeFile(args.destination, result);
}

void runWorker.child(main);
