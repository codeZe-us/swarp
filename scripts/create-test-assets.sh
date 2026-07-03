#!/bin/bash
set -e

# Change directory to project root
cd "$(dirname "$0")/.."

ENV_FILE="scripts/.env.testnet"

# Initialize env file if not exists
if [ ! -f "$ENV_FILE" ]; then
  echo "# ZendSwap Testnet Environment Configuration" > "$ENV_FILE"
fi

# Load env so we know if they are deployed
if [ -f "$ENV_FILE" ]; then
  source "$ENV_FILE"
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
  if ! ./stellar.exe keys address "$alias" >/dev/null 2>&1; then
    echo "Generating and funding account: $alias..."
    ./stellar.exe keys generate "$alias" --network testnet --fund
  else
    local addr
    addr=$(./stellar.exe keys address "$alias")
    echo "Account $alias already exists: $addr"
  fi
}

echo "=== Generating and Funding Accounts ==="
generate_and_fund "usdc-issuer"
generate_and_fund "eurc-issuer"
generate_and_fund "mgusd-issuer"
generate_and_fund "ylds-issuer"
generate_and_fund "admin"
generate_and_fund "pool-operator"
generate_and_fund "test-user"

# Retrieve public keys and secrets
USDC_ISSUER_ADDRESS=$(./stellar.exe keys address usdc-issuer)
EURC_ISSUER_ADDRESS=$(./stellar.exe keys address eurc-issuer)
MGUSD_ISSUER_ADDRESS=$(./stellar.exe keys address mgusd-issuer)
YLDS_ISSUER_ADDRESS=$(./stellar.exe keys address ylds-issuer)
ADMIN_ADDRESS=$(./stellar.exe keys address admin)
POOL_OPERATOR_ADDRESS=$(./stellar.exe keys address pool-operator)
TEST_USER_ADDRESS=$(./stellar.exe keys address test-user)

USDC_ISSUER_SECRET=$(./stellar.exe keys secret usdc-issuer)
EURC_ISSUER_SECRET=$(./stellar.exe keys secret eurc-issuer)
MGUSD_ISSUER_SECRET=$(./stellar.exe keys secret mgusd-issuer)
YLDS_ISSUER_SECRET=$(./stellar.exe keys secret ylds-issuer)
ADMIN_SECRET=$(./stellar.exe keys secret admin)
POOL_OPERATOR_SECRET=$(./stellar.exe keys secret pool-operator)
TEST_USER_SECRET=$(./stellar.exe keys secret test-user)

# Update environment configurations
update_env "USDC_ISSUER_ADDRESS" "$USDC_ISSUER_ADDRESS"
update_env "USDC_ISSUER_SECRET" "$USDC_ISSUER_SECRET"
update_env "EURC_ISSUER_ADDRESS" "$EURC_ISSUER_ADDRESS"
update_env "EURC_ISSUER_SECRET" "$EURC_ISSUER_SECRET"
update_env "MGUSD_ISSUER_ADDRESS" "$MGUSD_ISSUER_ADDRESS"
update_env "MGUSD_ISSUER_SECRET" "$MGUSD_ISSUER_SECRET"
update_env "YLDS_ISSUER_ADDRESS" "$YLDS_ISSUER_ADDRESS"
update_env "YLDS_ISSUER_SECRET" "$YLDS_ISSUER_SECRET"
update_env "ADMIN_ADDRESS" "$ADMIN_ADDRESS"
update_env "ADMIN_SECRET" "$ADMIN_SECRET"
update_env "POOL_OPERATOR_ADDRESS" "$POOL_OPERATOR_ADDRESS"
update_env "POOL_OPERATOR_SECRET" "$POOL_OPERATOR_SECRET"
update_env "TEST_USER_ADDRESS" "$TEST_USER_ADDRESS"
update_env "TEST_USER_SECRET" "$TEST_USER_SECRET"

echo "=== Deploying Stellar Asset Contracts ==="
if [ -z "$USDC_SAC_ID" ]; then
  echo "Deploying/Retrieving SAC for USDC..."
  USDC_SAC_ID=$(./stellar.exe contract asset deploy --asset "USDC:$USDC_ISSUER_ADDRESS" --network testnet --source-account admin)
  echo "USDC SAC ID: $USDC_SAC_ID"
  update_env "USDC_SAC_ID" "$USDC_SAC_ID"
else
  echo "USDC SAC already deployed: $USDC_SAC_ID"
fi

if [ -z "$EURC_SAC_ID" ]; then
  echo "Deploying/Retrieving SAC for EURC..."
  EURC_SAC_ID=$(./stellar.exe contract asset deploy --asset "EURC:$EURC_ISSUER_ADDRESS" --network testnet --source-account admin)
  echo "EURC SAC ID: $EURC_SAC_ID"
  update_env "EURC_SAC_ID" "$EURC_SAC_ID"
else
  echo "EURC SAC already deployed: $EURC_SAC_ID"
fi

if [ -z "$MGUSD_SAC_ID" ]; then
  echo "Deploying/Retrieving SAC for MGUSD..."
  MGUSD_SAC_ID=$(./stellar.exe contract asset deploy --asset "MGUSD:$MGUSD_ISSUER_ADDRESS" --network testnet --source-account admin)
  echo "MGUSD SAC ID: $MGUSD_SAC_ID"
  update_env "MGUSD_SAC_ID" "$MGUSD_SAC_ID"
else
  echo "MGUSD SAC already deployed: $MGUSD_SAC_ID"
fi

if [ -z "$YLDS_SAC_ID" ]; then
  echo "Deploying/Retrieving SAC for YLDS..."
  YLDS_SAC_ID=$(./stellar.exe contract asset deploy --asset "YLDS:$YLDS_ISSUER_ADDRESS" --network testnet --source-account admin)
  echo "YLDS SAC ID: $YLDS_SAC_ID"
  update_env "YLDS_SAC_ID" "$YLDS_SAC_ID"
else
  echo "YLDS SAC already deployed: $YLDS_SAC_ID"
fi

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
  ./stellar.exe tx new change-trust --source-account pool-operator --line "USDC:$USDC_ISSUER_ADDRESS" --network testnet --build-only \
    | ./stellar.exe tx sign --sign-with-key pool-operator --network testnet \
    | ./stellar.exe tx send --network testnet
fi

if ! has_trustline "$POOL_OPERATOR_ADDRESS" "EURC" "$EURC_ISSUER_ADDRESS"; then
  echo "Creating trustline for pool-operator to EURC..."
  ./stellar.exe tx new change-trust --source-account pool-operator --line "EURC:$EURC_ISSUER_ADDRESS" --network testnet --build-only \
    | ./stellar.exe tx sign --sign-with-key pool-operator --network testnet \
    | ./stellar.exe tx send --network testnet
fi

if ! has_trustline "$POOL_OPERATOR_ADDRESS" "MGUSD" "$MGUSD_ISSUER_ADDRESS"; then
  echo "Creating trustline for pool-operator to MGUSD..."
  ./stellar.exe tx new change-trust --source-account pool-operator --line "MGUSD:$MGUSD_ISSUER_ADDRESS" --network testnet --build-only \
    | ./stellar.exe tx sign --sign-with-key pool-operator --network testnet \
    | ./stellar.exe tx send --network testnet
fi

if ! has_trustline "$POOL_OPERATOR_ADDRESS" "YLDS" "$YLDS_ISSUER_ADDRESS"; then
  echo "Creating trustline for pool-operator to YLDS..."
  ./stellar.exe tx new change-trust --source-account pool-operator --line "YLDS:$YLDS_ISSUER_ADDRESS" --network testnet --build-only \
    | ./stellar.exe tx sign --sign-with-key pool-operator --network testnet \
    | ./stellar.exe tx send --network testnet
fi

# Test User trustlines
if ! has_trustline "$TEST_USER_ADDRESS" "USDC" "$USDC_ISSUER_ADDRESS"; then
  echo "Creating trustline for test-user to USDC..."
  ./stellar.exe tx new change-trust --source-account test-user --line "USDC:$USDC_ISSUER_ADDRESS" --network testnet --build-only \
    | ./stellar.exe tx sign --sign-with-key test-user --network testnet \
    | ./stellar.exe tx send --network testnet
fi

if ! has_trustline "$TEST_USER_ADDRESS" "EURC" "$EURC_ISSUER_ADDRESS"; then
  echo "Creating trustline for test-user to EURC..."
  ./stellar.exe tx new change-trust --source-account test-user --line "EURC:$EURC_ISSUER_ADDRESS" --network testnet --build-only \
    | ./stellar.exe tx sign --sign-with-key test-user --network testnet \
    | ./stellar.exe tx send --network testnet
fi

# Function to get balance
get_balance() {
  local addr=$1
  local code=$2
  local issuer=$3
  curl -s "https://horizon-testnet.stellar.org/accounts/$addr" \
    | "C:/Users/TCE HUB/AppData/Local/Microsoft/WinGet/Packages/jqlang.jq_Microsoft.Winget.Source_8wekyb3d8bbwe/jq.exe" -r ".balances[] | select(.asset_code==\"$code\" and .asset_issuer==\"$issuer\") | .balance" 2>/dev/null
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
    ./stellar.exe tx new payment \
      --source-account "$issuer_alias" \
      --destination "$recipient_addr" \
      --amount "$amount" \
      --asset "$code:$issuer_addr" \
      --network testnet \
      --build-only \
      | ./stellar.exe tx sign --sign-with-key "$issuer_alias" --network testnet \
      | ./stellar.exe tx send --network testnet
  else
    echo "$code balance for $recipient_addr is sufficient ($balance)."
  fi
}

echo "=== Minting Assets ==="
mint_if_needed "$POOL_OPERATOR_ADDRESS" "USDC" "$USDC_ISSUER_ADDRESS" "usdc-issuer" "500000000000"
mint_if_needed "$POOL_OPERATOR_ADDRESS" "EURC" "$EURC_ISSUER_ADDRESS" "eurc-issuer" "500000000000"
mint_if_needed "$POOL_OPERATOR_ADDRESS" "MGUSD" "$MGUSD_ISSUER_ADDRESS" "mgusd-issuer" "500000000000"
mint_if_needed "$POOL_OPERATOR_ADDRESS" "YLDS" "$YLDS_ISSUER_ADDRESS" "ylds-issuer" "500000000000"

mint_if_needed "$TEST_USER_ADDRESS" "USDC" "$USDC_ISSUER_ADDRESS" "usdc-issuer" "10000"
mint_if_needed "$TEST_USER_ADDRESS" "EURC" "$EURC_ISSUER_ADDRESS" "eurc-issuer" "1000"
mint_if_needed "$TEST_USER_ADDRESS" "MGUSD" "$MGUSD_ISSUER_ADDRESS" "mgusd-issuer" "10000"
mint_if_needed "$TEST_USER_ADDRESS" "YLDS" "$YLDS_ISSUER_ADDRESS" "ylds-issuer" "1000"

echo "=== create-test-assets.sh execution completed successfully ==="
