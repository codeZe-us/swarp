#!/usr/bin/env bash
# =============================================================================
# circuits/scripts/generate-test-fixtures.sh
# Computes witnesses, runs nargo, bb prove, and generates Rust byte arrays
# for pool unit/integration tests.
#
# IMPORTANT:
#   This script MUST be re-run if any of the following change:
#     1. The Noir circuit code (circuits/src/main.nr)
#     2. The test inputs (secret, rates, amounts) in generate-test-fixtures.ts
#     3. The version of nargo or bb.
#
# Usage:
#   cd circuits
#   ./scripts/generate-test-fixtures.sh
# =============================================================================
set -euo pipefail

SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPTS_DIR/.."

echo "Compiling and running generate-test-fixtures.ts..."

# Compile TypeScript script to JavaScript
npx tsc scripts/generate-test-fixtures.ts \
  --module commonjs \
  --target es2022 \
  --esModuleInterop \
  --skipLibCheck \
  --outDir scripts

# Run the compiled JavaScript script
node scripts/generate-test-fixtures.js

echo "Test fixtures successfully written to contracts/zendswap-pool/src/test_fixtures.rs!"
