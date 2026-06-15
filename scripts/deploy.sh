#!/bin/bash
set -e

# Change directory to scripts root
cd "$(dirname "$0")"

echo "Deploying Swarp smart contracts to Stellar Testnet..."
pnpm exec tsx src/deploy.ts
