#!/usr/bin/env bash
set -euo pipefail

# Start clean so cached artifacts don't block recompilation.
rm -rf node_modules
npm install

# Remove generated assets before rebuilding everything.
npm run clean

# Recreate the toolchain and artifacts with fresh outputs.
./scripts/fetch_circom --force
./scripts/generate_circuits
./scripts/compile_circuits --force

# Retrieve and verify the artifacts.
npm test
npm run check

# Rebuild the artifacts.
#npm run build
#./scripts/prepare_ceremony --force
#npm run export