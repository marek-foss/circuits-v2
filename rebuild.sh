#!/usr/bin/env bash
set -euo pipefail

# Start clean so cached artifacts don't block recompilation.
rm -rf node_modules
npm install

# Remove generated assets before rebuilding everything.
./scripts/clean

# Recreate the toolchain and artifacts with fresh outputs.
./scripts/fetch_circom --verbose --force
./scripts/generate_circuits
./scripts/compile_circuits --force

# Retrieve and verify the artifacts.
./scripts/check_circuits
npm test

# Rebuild and export the artifacts.
./scripts/prepare_ceremony --force