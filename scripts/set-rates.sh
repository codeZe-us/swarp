#!/bin/bash
set -e

# Change directory to project root
cd "$(dirname "$0")/.."

ENV_FILE="scripts/.env.testnet"

# Load environment variables
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

if [ -z "$POOL_CONTRACT_ID" ]; then
  echo "Error: POOL_CONTRACT_ID not found in $ENV_FILE"
  exit 1
fi

if [ -z "$POOL_OPERATOR_ADDRESS" ]; then
  echo "Error: POOL_OPERATOR_ADDRESS not found in $ENV_FILE"
  exit 1
fi

echo "=== Setting Rates for ZendSwap Pool Multi ==="
echo "Pool ID: $POOL_CONTRACT_ID"

# 0 = USDC, 1 = EURC, 2 = MGUSD, 3 = YLDS, 4 = XLM
# Default rate is 0.92 (9200000 / 10000000) inside the initialize script, but let's be explicit here.

# Helper function to set rate
set_rate() {
  local asset_in=$1
  local asset_out=$2
  local numerator=$3
  local denominator=$4
  local desc=$5

  echo "Setting rate for $desc (in: $asset_in, out: $asset_out) -> $numerator / $denominator"
  
  ./stellar.exe contract invoke \
    --id "$POOL_CONTRACT_ID" \
    --source-account admin \
    --network testnet \
    -- \
    update_rate \
    --asset_in "$asset_in" \
    --asset_out "$asset_out" \
    --numerator "$numerator" \
    --denominator "$denominator"
}

# Example real-world test rates
# Base is USD (10,000,000)

# Same assets (1:1)
set_rate 0 0 10000000 10000000 "USDC -> USDC"
set_rate 1 1 10000000 10000000 "EURC -> EURC"
set_rate 2 2 10000000 10000000 "MGUSD -> MGUSD"
set_rate 3 3 10000000 10000000 "YLDS -> YLDS"
set_rate 4 4 10000000 10000000 "XLM -> XLM"

# USDC (0) to others
set_rate 0 1  9200000 10000000 "USDC -> EURC"  # 1 USDC = 0.92 EURC
set_rate 0 2 10000000 10000000 "USDC -> MGUSD" # 1 USDC = 1 MGUSD
set_rate 0 3 10000000 10000000 "USDC -> YLDS"  # 1 USDC = 1 YLDS
set_rate 0 4 100000000 10000000 "USDC -> XLM"  # 1 USDC = 10 XLM

# EURC (1) to others
set_rate 1 0 10800000 10000000 "EURC -> USDC"  # 1 EURC = 1.08 USDC
set_rate 1 2 10800000 10000000 "EURC -> MGUSD" # 1 EURC = 1.08 MGUSD
set_rate 1 3 10800000 10000000 "EURC -> YLDS"  # 1 EURC = 1.08 YLDS
set_rate 1 4 108000000 10000000 "EURC -> XLM"  # 1 EURC = 10.8 XLM

# MGUSD (2) to others
set_rate 2 0 10000000 10000000 "MGUSD -> USDC" # 1 MGUSD = 1 USDC
set_rate 2 1  9200000 10000000 "MGUSD -> EURC" # 1 MGUSD = 0.92 EURC
set_rate 2 3 10000000 10000000 "MGUSD -> YLDS" # 1 MGUSD = 1 YLDS
set_rate 2 4 100000000 10000000 "MGUSD -> XLM" # 1 MGUSD = 10 XLM

# YLDS (3) to others
set_rate 3 0 10000000 10000000 "YLDS -> USDC"  # 1 YLDS = 1 USDC
set_rate 3 1  9200000 10000000 "YLDS -> EURC"  # 1 YLDS = 0.92 EURC
set_rate 3 2 10000000 10000000 "YLDS -> MGUSD" # 1 YLDS = 1 MGUSD
set_rate 3 4 100000000 10000000 "YLDS -> XLM"  # 1 YLDS = 10 XLM

# XLM (4) to others
set_rate 4 0  1000000 10000000 "XLM -> USDC"   # 1 XLM = 0.1 USDC
set_rate 4 1   920000 10000000 "XLM -> EURC"   # 1 XLM = 0.092 EURC
set_rate 4 2  1000000 10000000 "XLM -> MGUSD"  # 1 XLM = 0.1 MGUSD
set_rate 4 3  1000000 10000000 "XLM -> YLDS"   # 1 XLM = 0.1 YLDS

echo "=== All rates set successfully ==="
