#!/bin/bash
set -e

# Change directory to project root
cd "$(dirname "$0")/.."

ENV_FILE="scripts/.env.testnet"

# Initialize env file if not exists
if [ ! -f "$ENV_FILE" ]; then
  echo "# ZendSwap Testnet Environment Configuration" > "$ENV_FILE"
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

generate_and_fund() {
  local alias=$1
  if ! stellar keys address "$alias" >/dev/null 2>&1; then
    echo "Generating and funding account: $alias..."
    stellar keys generate "$alias" --network testnet --fund
  else
    local addr
    addr=$(stellar keys address "$alias")
    echo "Account $alias already exists: $addr"
  fi
}

echo "=== Generating and Funding Accounts ==="
generate_and_fund "usdc-issuer"
generate_and_fund "eurc-issuer"
generate_and_fund "admin"
generate_and_fund "pool-operator"
generate_and_fund "test-user"

# Retrieve public keys and secrets
USDC_ISSUER_ADDRESS=$(stellar keys address usdc-issuer)
EURC_ISSUER_ADDRESS=$(stellar keys address eurc-issuer)
ADMIN_ADDRESS=$(stellar keys address admin)
POOL_OPERATOR_ADDRESS=$(stellar keys address pool-operator)
TEST_USER_ADDRESS=$(stellar keys address test-user)

USDC_ISSUER_SECRET=$(stellar keys secret usdc-issuer)
EURC_ISSUER_SECRET=$(stellar keys secret eurc-issuer)
ADMIN_SECRET=$(stellar keys secret admin)
POOL_OPERATOR_SECRET=$(stellar keys secret pool-operator)
TEST_USER_SECRET=$(stellar keys secret test-user)

# Update environment configurations
update_env "USDC_ISSUER_ADDRESS" "$USDC_ISSUER_ADDRESS"
update_env "USDC_ISSUER_SECRET" "$USDC_ISSUER_SECRET"
update_env "EURC_ISSUER_ADDRESS" "$EURC_ISSUER_ADDRESS"
update_env "EURC_ISSUER_SECRET" "$EURC_ISSUER_SECRET"
update_env "ADMIN_ADDRESS" "$ADMIN_ADDRESS"
update_env "ADMIN_SECRET" "$ADMIN_SECRET"
update_env "POOL_OPERATOR_ADDRESS" "$POOL_OPERATOR_ADDRESS"
update_env "POOL_OPERATOR_SECRET" "$POOL_OPERATOR_SECRET"
update_env "TEST_USER_ADDRESS" "$TEST_USER_ADDRESS"
update_env "TEST_USER_SECRET" "$TEST_USER_SECRET"

echo "=== Deploying Stellar Asset Contracts ==="
echo "Deploying/Retrieving SAC for USDC..."
USDC_SAC_ID=$(stellar contract asset deploy --asset "USDC:$USDC_ISSUER_ADDRESS" --network testnet --source admin)
echo "USDC SAC ID: $USDC_SAC_ID"
update_env "USDC_SAC_ID" "$USDC_SAC_ID"

echo "Deploying/Retrieving SAC for EURC..."
EURC_SAC_ID=$(stellar contract asset deploy --asset "EURC:$EURC_ISSUER_ADDRESS" --network testnet --source admin)
echo "EURC SAC ID: $EURC_SAC_ID"
update_env "EURC_SAC_ID" "$EURC_SAC_ID"

# Function to check if a trustline exists on testnet
has_trustline() {
  local addr=$1
  local code=$2
  local issuer=$3
  local res
  res=$(curl -s "https://horizon-testnet.stellar.org/accounts/$addr")
  if echo "$res" | grep -q "\"asset_code\":\"$code\"" && echo "$res" | grep -q "\"asset_issuer\":\"$issuer\""; then
    return 0
  else
    return 1
  fi
}

echo "=== Establishing Trustlines ==="

# Pool Operator trustlines
if ! has_trustline "$POOL_OPERATOR_ADDRESS" "USDC" "$USDC_ISSUER_ADDRESS"; then
  echo "Creating trustline for pool-operator to USDC..."
  stellar tx new change-trust --source-account pool-operator --line "USDC:$USDC_ISSUER_ADDRESS" --network testnet \
    | stellar tx sign --source pool-operator --network testnet \
    | stellar tx send --network testnet
fi

if ! has_trustline "$POOL_OPERATOR_ADDRESS" "EURC" "$EURC_ISSUER_ADDRESS"; then
  echo "Creating trustline for pool-operator to EURC..."
  stellar tx new change-trust --source-account pool-operator --line "EURC:$EURC_ISSUER_ADDRESS" --network testnet \
    | stellar tx sign --source pool-operator --network testnet \
    | stellar tx send --network testnet
fi

# Test User trustlines
if ! has_trustline "$TEST_USER_ADDRESS" "USDC" "$USDC_ISSUER_ADDRESS"; then
  echo "Creating trustline for test-user to USDC..."
  stellar tx new change-trust --source-account test-user --line "USDC:$USDC_ISSUER_ADDRESS" --network testnet \
    | stellar tx sign --source test-user --network testnet \
    | stellar tx send --network testnet
fi

if ! has_trustline "$TEST_USER_ADDRESS" "EURC" "$EURC_ISSUER_ADDRESS"; then
  echo "Creating trustline for test-user to EURC..."
  stellar tx new change-trust --source-account test-user --line "EURC:$EURC_ISSUER_ADDRESS" --network testnet \
    | stellar tx sign --source test-user --network testnet \
    | stellar tx send --network testnet
fi

# Function to get balance
get_balance() {
  local addr=$1
  local code=$2
  local issuer=$3
  curl -s "https://horizon-testnet.stellar.org/accounts/$addr" \
    | jq -r ".balances[] | select(.asset_code==\"$code\" and .asset_issuer==\"$issuer\") | .balance" 2>/dev/null
}

mint_if_needed() {
  local recipient_addr=$1
  local code=$2
  local issuer_addr=$3
  local issuer_alias=$4
  local amount=$5
  
  local balance
  balance=$(get_balance "$recipient_addr" "$code" "$issuer_addr")
  local balance_int=${balance%%.*}
  if [ -z "$balance_int" ]; then
    balance_int=0
  fi
  
  if [ "$balance_int" -lt "$amount" ]; then
    echo "Minting $amount $code to $recipient_addr (current: $balance)..."
    stellar tx new payment \
      --source-account "$issuer_alias" \
      --destination "$recipient_addr" \
      --amount "$amount" \
      --asset "$code:$issuer_addr" \
      --network testnet \
      | stellar tx sign --source "$issuer_alias" --network testnet \
      | stellar tx send --network testnet
  else
    echo "$code balance for $recipient_addr is sufficient ($balance)."
  fi
}

echo "=== Minting Assets ==="
mint_if_needed "$POOL_OPERATOR_ADDRESS" "USDC" "$USDC_ISSUER_ADDRESS" "usdc-issuer" "100000"
mint_if_needed "$POOL_OPERATOR_ADDRESS" "EURC" "$EURC_ISSUER_ADDRESS" "eurc-issuer" "100000"
mint_if_needed "$TEST_USER_ADDRESS" "USDC" "$USDC_ISSUER_ADDRESS" "usdc-issuer" "10000"
mint_if_needed "$TEST_USER_ADDRESS" "EURC" "$EURC_ISSUER_ADDRESS" "eurc-issuer" "1000"

echo "=== create-test-assets.sh execution completed successfully ==="
