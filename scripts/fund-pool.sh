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
  echo "Error: POOL_CONTRACT_ID is not set in .env.testnet. Please run deploy.sh first."
  exit 1
fi

echo "=== Querying Current Pool reserves ==="
info=$(./stellar.exe contract invoke --id "$POOL_CONTRACT_ID" --source-account pool-operator --network testnet -- get_pool_info)
echo "Current Pool Info:"
echo "$info" | jq .

usdc_reserve=$(echo "$info" | jq -r '.usdc_reserve')
eurc_reserve=$(echo "$info" | jq -r '.eurc_reserve')
mgusd_reserve=$(echo "$info" | jq -r '.mgusd_reserve')
ylds_reserve=$(echo "$info" | jq -r '.ylds_reserve')

# Convert reserve fields to integers by removing any decimals
usdc_reserve_int=${usdc_reserve%%.*}
if [ -z "$usdc_reserve_int" ]; then
  usdc_reserve_int=0
fi

eurc_reserve_int=${eurc_reserve%%.*}
if [ -z "$eurc_reserve_int" ]; then
  eurc_reserve_int=0
fi

mgusd_reserve_int=${mgusd_reserve%%.*}
if [ -z "$mgusd_reserve_int" ]; then
  mgusd_reserve_int=0
fi

ylds_reserve_int=${ylds_reserve%%.*}
if [ -z "$ylds_reserve_int" ]; then
  ylds_reserve_int=0
fi

# Define reserve funding amount (50,000 units with 7 decimals = 500,000,000,000)
FUND_AMOUNT=500000000000

echo "=== Funding Pool ==="

if [ "$usdc_reserve_int" -eq 0 ]; then
  echo "USDC reserve is 0. Funding pool with 50,000 USDC..."
  ./stellar.exe contract invoke \
    --id "$POOL_CONTRACT_ID" \
    --source-account pool-operator \
    --network testnet \
    -- \
    fund_pool \
    --funder "$POOL_OPERATOR_ADDRESS" \
    --asset_id 0 \
    --amount "$FUND_AMOUNT"
  echo "Funded USDC reserves."
else
  echo "USDC reserve is already funded: $usdc_reserve"
fi

if [ "$eurc_reserve_int" -eq 0 ]; then
  echo "EURC reserve is 0. Funding pool with 50,000 EURC..."
  ./stellar.exe contract invoke \
    --id "$POOL_CONTRACT_ID" \
    --source-account pool-operator \
    --network testnet \
    -- \
    fund_pool \
    --funder "$POOL_OPERATOR_ADDRESS" \
    --asset_id 1 \
    --amount "$FUND_AMOUNT"
  echo "Funded EURC reserves."
else
  echo "EURC reserve is already funded: $eurc_reserve"
fi

if [ "$mgusd_reserve_int" -eq 0 ] || [ "$mgusd_reserve_int" = "null" ]; then
  echo "MGUSD reserve is 0. Funding pool with 50,000 MGUSD..."
  ./stellar.exe contract invoke \
    --id "$POOL_CONTRACT_ID" \
    --source-account pool-operator \
    --network testnet \
    -- \
    fund_pool \
    --funder "$POOL_OPERATOR_ADDRESS" \
    --asset_id 2 \
    --amount "$FUND_AMOUNT"
  echo "Funded MGUSD reserves."
else
  echo "MGUSD reserve is already funded: $mgusd_reserve"
fi

if [ "$ylds_reserve_int" -eq 0 ] || [ "$ylds_reserve_int" = "null" ]; then
  echo "YLDS reserve is 0. Funding pool with 50,000 YLDS..."
  stellar contract invoke \
    --id "$POOL_CONTRACT_ID" \
    --source pool-operator \
    --network testnet \
    -- \
    fund_pool \
    --funder "$POOL_OPERATOR_ADDRESS" \
    --asset_id 3 \
    --amount "$FUND_AMOUNT"
  echo "Funded YLDS reserves."
else
  echo "YLDS reserve is already funded: $ylds_reserve"
fi

echo "=== Verifying Reserves ==="
final_info=$(./stellar.exe contract invoke --id "$POOL_CONTRACT_ID" --source-account pool-operator --network testnet -- get_pool_info)
echo "Final Pool Info:"
echo "$final_info" | jq .

echo "=== fund-pool.sh execution completed successfully ==="
