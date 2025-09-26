const zlib = require("node:zlib");
const fs = require("node:fs/promises");
const { runWorker, pathExists } = require("../../lib/shared.js");
const path = require("node:path");

async function main(args) {
  const file = await fs.readFile(args.source);
  const calcwit_cpp = await fs.readFile("./cpp-circuit-template/calcwit.cpp");
  const calcwit_hpp = await fs.readFile("./cpp-circuit-template/calcwit.hpp");
  const circom_hpp = await fs.readFile("./cpp-circuit-template/circom.hpp");
  const createwit_cpp = await fs.readFile(
    "./cpp-circuit-template/createwit.cpp"
  );

  let data = new TextDecoder().decode(file);

  let calcwit_cpp_data = new TextDecoder().decode(calcwit_cpp);
  let calcwit_hpp_data = new TextDecoder().decode(calcwit_hpp);
  let circom_hpp_data = new TextDecoder().decode(circom_hpp);
  let createwit_cpp_data = new TextDecoder().decode(createwit_cpp);

  let cpp_circuit = data.replace(
    `#include "circom.hpp"
#include "calcwit.hpp"`,
    `#include "${args.name}_circom.hpp"
#include "${args.name}_calcwit.hpp"
namespace ${args.name} {`
  );

  cpp_circuit += `}
`;

  const calcwit_cpp_out = calcwit_cpp_data.replaceAll(
    "<TARGET_NAME>",
    args.name
  );
  const calcwit_hpp_out = calcwit_hpp_data.replaceAll(
    "<TARGET_NAME>",
    args.name
  );
  const circom_hpp_out = circom_hpp_data.replaceAll("<TARGET_NAME>", args.name);
  const createwit_cpp_out = createwit_cpp_data.replaceAll(
    "<TARGET_NAME>",
    args.name
  );

  const base_dir = path.join(args.upgradeDir, args.name);

  if (!pathExists(base_dir)) await fs.mkdir(base_dir);

  await fs.writeFile(
    path.join(base_dir, `${args.name}_calcwit.cpp`),
    calcwit_cpp_out
  );
  await fs.writeFile(
    path.join(base_dir, `${args.name}_calcwit.hpp`),
    calcwit_hpp_out
  );
  await fs.writeFile(
    path.join(base_dir, `${args.name}_circom.hpp`),
    circom_hpp_out
  );
  await fs.writeFile(
    path.join(base_dir, `${args.name}_createwit.cpp`),
    createwit_cpp_out,
    { mode: 0o755 }
  );
  // output cpp circuit file
  await fs.writeFile(
    path.join(base_dir, `${args.name}_circuit.cpp`),
    cpp_circuit
  );
}

void runWorker.child(main);
