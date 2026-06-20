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

update_env() {
  local key=$1
  local val=$2
  if grep -q "^$key=" "$ENV_FILE" 2>/dev/null; then
    sed "s|^$key=.*|$key=$val|" "$ENV_FILE" > "${ENV_FILE}.tmp" && mv "${ENV_FILE}.tmp" "$ENV_FILE"
  else
    echo "$key=$val" >> "$ENV_FILE"
  fi
}

echo "=== Building Contracts ==="
(cd contracts && cargo rustc -p ultrahonk-verifier --target wasm32v1-none --release -- --crate-type=cdylib)
(cd contracts && cargo rustc -p zendswap-pool --target wasm32v1-none --release -- --crate-type=cdylib)

echo "=== Deploying ultrahonk-verifier ==="
if [ -n "$VERIFIER_CONTRACT_ID" ]; then
  echo "Verifier contract already deployed at: $VERIFIER_CONTRACT_ID"
else
  echo "Deploying ultrahonk-verifier contract to testnet..."
  VERIFIER_CONTRACT_ID=$(stellar contract deploy \
    --wasm contracts/target/wasm32v1-none/release/ultrahonk_verifier.wasm \
    --source admin \
    --network testnet)
  echo "Deployed Verifier Contract ID: $VERIFIER_CONTRACT_ID"
  update_env "VERIFIER_CONTRACT_ID" "$VERIFIER_CONTRACT_ID"
fi

echo "=== Deploying zendswap-pool ==="
if [ -n "$POOL_CONTRACT_ID" ]; then
  echo "Pool contract already deployed at: $POOL_CONTRACT_ID"
else
  echo "Deploying zendswap-pool contract to testnet..."
  POOL_CONTRACT_ID=$(stellar contract deploy \
    --wasm contracts/target/wasm32v1-none/release/zendswap_pool.wasm \
    --source admin \
    --network testnet)
  echo "Deployed Pool Contract ID: $POOL_CONTRACT_ID"
  update_env "POOL_CONTRACT_ID" "$POOL_CONTRACT_ID"
fi

# Function to check if the pool contract is already initialized
is_initialized() {
  local pool_id=$1
  local info
  info=$(stellar contract invoke --id "$pool_id" --network testnet -- get_pool_info 2>/dev/null)
  if [ $? -eq 0 ] && echo "$info" | jq -e '.current_rate != 0' >/dev/null 2>&1; then
    return 0
  else
    return 1
  fi
}

echo "=== Initializing ZendSwap Pool ==="
if is_initialized "$POOL_CONTRACT_ID"; then
  echo "Pool contract is already initialized."
else
  echo "Initializing pool contract..."
  stellar contract invoke \
    --id "$POOL_CONTRACT_ID" \
    --source admin \
    --network testnet \
    -- \
    initialize \
    --admin "$POOL_OPERATOR_ADDRESS" \
    --usdc "$USDC_SAC_ID" \
    --eurc "$EURC_SAC_ID" \
    --verifier "$VERIFIER_CONTRACT_ID" \
    --rate_numerator 9200000 \
    --rate_denominator 10000000
  echo "Pool initialization complete."
fi

echo "=== deploy.sh execution completed successfully ==="
