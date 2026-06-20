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
info=$(stellar contract invoke --id "$POOL_CONTRACT_ID" --network testnet -- get_pool_info)
echo "Current Pool Info:"
echo "$info" | jq .

usdc_reserve=$(echo "$info" | jq -r '.usdc_reserve')
eurc_reserve=$(echo "$info" | jq -r '.eurc_reserve')

# Convert reserve fields to integers by removing any decimals
usdc_reserve_int=${usdc_reserve%%.*}
if [ -z "$usdc_reserve_int" ]; then
  usdc_reserve_int=0
fi

eurc_reserve_int=${eurc_reserve%%.*}
if [ -z "$eurc_reserve_int" ]; then
  eurc_reserve_int=0
fi

# Define reserve funding amount (50,000 units with 7 decimals = 500,000,000,000)
FUND_AMOUNT=500000000000

echo "=== Funding Pool ==="

if [ "$usdc_reserve_int" -eq 0 ]; then
  echo "USDC reserve is 0. Funding pool with 50,000 USDC..."
  stellar contract invoke \
    --id "$POOL_CONTRACT_ID" \
    --source pool-operator \
    --network testnet \
    -- \
    fund_pool \
    --funder "$POOL_OPERATOR_ADDRESS" \
    --token "$USDC_SAC_ID" \
    --amount "$FUND_AMOUNT"
  echo "Funded USDC reserves."
else
  echo "USDC reserve is already funded: $usdc_reserve"
fi

if [ "$eurc_reserve_int" -eq 0 ]; then
  echo "EURC reserve is 0. Funding pool with 50,000 EURC..."
  stellar contract invoke \
    --id "$POOL_CONTRACT_ID" \
    --source pool-operator \
    --network testnet \
    -- \
    fund_pool \
    --funder "$POOL_OPERATOR_ADDRESS" \
    --token "$EURC_SAC_ID" \
    --amount "$FUND_AMOUNT"
  echo "Funded EURC reserves."
else
  echo "EURC reserve is already funded: $eurc_reserve"
fi

echo "=== Verifying Reserves ==="
final_info=$(stellar contract invoke --id "$POOL_CONTRACT_ID" --network testnet -- get_pool_info)
echo "Final Pool Info:"
echo "$final_info" | jq .

echo "=== fund-pool.sh execution completed successfully ==="
