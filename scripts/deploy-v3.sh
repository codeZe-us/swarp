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
(cd contracts && cargo build --target wasm32v1-none --release -p ultrahonk-verifier)
(cd contracts && cargo build --target wasm32v1-none --release -p zendswap-pool-multi)

echo "=== Deploying ultrahonk-verifier ==="
echo "Deploying ultrahonk-verifier contract to testnet..."
VERIFIER_CONTRACT_ID=$(./stellar.exe contract deploy \
  --wasm contracts/target/wasm32v1-none/release/ultrahonk_verifier.wasm \
  --source-account admin \
  --network testnet)
echo "Deployed Verifier Contract ID: $VERIFIER_CONTRACT_ID"
update_env "VERIFIER_CONTRACT_ID" "$VERIFIER_CONTRACT_ID"

echo "=== Deploying zendswap-pool-multi v3 ==="
echo "Deploying zendswap-pool-multi v3 contract to testnet..."
POOL_CONTRACT_ID=$(./stellar.exe contract deploy \
  --wasm contracts/target/wasm32v1-none/release/zendswap_pool_multi.wasm \
  --source-account admin \
  --network testnet)
echo "Deployed Pool Contract ID: $POOL_CONTRACT_ID"
update_env "POOL_CONTRACT_ID" "$POOL_CONTRACT_ID"

# Update web/.env.local directly too
if [ -f "web/.env.local" ]; then
  # First, save the old pool ID as the legacy pool
  if grep -q "^NEXT_PUBLIC_POOL_CONTRACT_ID=" "web/.env.local"; then
    OLD_POOL_ID=$(grep "^NEXT_PUBLIC_POOL_CONTRACT_ID=" "web/.env.local" | cut -d '=' -f2)
    if [ -n "$OLD_POOL_ID" ]; then
      if grep -q "^NEXT_PUBLIC_LEGACY_POOL_CONTRACT_ID=" "web/.env.local"; then
        sed -i "s|^NEXT_PUBLIC_LEGACY_POOL_CONTRACT_ID=.*|NEXT_PUBLIC_LEGACY_POOL_CONTRACT_ID=$OLD_POOL_ID|" "web/.env.local"
      else
        echo "NEXT_PUBLIC_LEGACY_POOL_CONTRACT_ID=$OLD_POOL_ID" >> "web/.env.local"
      fi
    fi
  fi

  sed -i "s|^NEXT_PUBLIC_VERIFIER_CONTRACT_ID=.*|NEXT_PUBLIC_VERIFIER_CONTRACT_ID=$VERIFIER_CONTRACT_ID|" "web/.env.local"
  sed -i "s|^NEXT_PUBLIC_POOL_CONTRACT_ID=.*|NEXT_PUBLIC_POOL_CONTRACT_ID=$POOL_CONTRACT_ID|" "web/.env.local"
  # Also handle legacy naming if it exists
  sed -i "s|^NEXT_PUBLIC_SWARP_CONTRACT_ID=.*|NEXT_PUBLIC_SWARP_CONTRACT_ID=$POOL_CONTRACT_ID|" "web/.env.local"
fi

# Function to check if the pool contract is already initialized
is_initialized() {
  local pool_id=$1
  local info
  info=$(./stellar.exe contract invoke --id "$pool_id" --source-account admin --network testnet -- get_pool_info 2>/dev/null)
  if [ $? -eq 0 ] && echo "$info" | "C:/Users/TCE HUB/AppData/Local/Microsoft/WinGet/Packages/jqlang.jq_Microsoft.Winget.Source_8wekyb3d8bbwe/jq.exe" -e '.current_rate != 0' >/dev/null 2>&1; then
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
  
  # Format array for Soroban CLI
  ASSETS_JSON="[\"$USDC_SAC_ID\", \"$EURC_SAC_ID\", \"$MGUSD_SAC_ID\", \"$YLDS_SAC_ID\", \"$XLM_SAC_ID\"]"

  ./stellar.exe contract invoke \
    --id "$POOL_CONTRACT_ID" \
    --source-account admin \
    --network testnet \
    -- \
    initialize \
    --admin "$POOL_OPERATOR_ADDRESS" \
    --assets "$ASSETS_JSON" \
    --verifier "$VERIFIER_CONTRACT_ID" \
    --default_rate_numerator 9200000 \
    --default_rate_denominator 10000000
  echo "Pool initialization complete."
fi

echo "=== deploy.sh execution completed successfully ==="
