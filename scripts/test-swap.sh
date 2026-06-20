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

if [ -z "$VERIFIER_CONTRACT_ID" ]; then
  echo "Error: VERIFIER_CONTRACT_ID is not set in .env.testnet. Please run deploy.sh first."
  exit 1
fi

echo "=== Deploying a fresh pool contract instance for testing ==="
TEST_POOL_ID=$(stellar contract deploy \
  --wasm contracts/target/wasm32v1-none/release/zendswap_pool.wasm \
  --source admin \
  --network testnet)
echo "Testing Pool Contract ID: $TEST_POOL_ID"

echo "=== Initializing testing pool contract ==="
stellar contract invoke \
  --id "$TEST_POOL_ID" \
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

echo "=== Funding testing pool with EURC reserves ==="
# Fund pool with 50,000 EURC (50000 * 10^7 = 500000000000)
stellar contract invoke \
  --id "$TEST_POOL_ID" \
  --source pool-operator \
  --network testnet \
  -- \
  fund_pool \
  --funder "$POOL_OPERATOR_ADDRESS" \
  --token "$EURC_SAC_ID" \
  --amount 500000000000

echo "=== Generating Prover.toml inputs ==="
pnpm --filter circuits witness

# Ensure circuits/Prover.toml exists
if [ ! -f "circuits/Prover.toml" ]; then
  echo "Error: circuits/Prover.toml was not generated."
  exit 1
fi

echo "=== Generating proof using nargo prove ==="
(cd circuits && nargo prove)

PROOF_FILE="circuits/proofs/swap.proof"
if [ ! -f "$PROOF_FILE" ]; then
  echo "Error: Proof file was not found at $PROOF_FILE"
  exit 1
fi

# Load proof bytes as hex
echo "Reading proof bytes..."
PROOF_HEX=$(node -e "console.log(require('fs').readFileSync('circuits/proofs/swap.proof').toString('hex'))")

# Load commitment, nullifier, and expected root
COMMITMENT="1053dca3a0159d8231c522b2b8125ef59ae932f13f9a45cc04e6cd948dc5c91b"
NULLIFIER_HEX=$(grep "^nullifier_hash" circuits/Prover.toml | cut -d'"' -f2 | sed 's/^0x//')
EXPECTED_ROOT_HEX=$(grep "^merkle_root" circuits/Prover.toml | cut -d'"' -f2 | sed 's/^0x//')

echo "Commitment:   $COMMITMENT"
echo "Nullifier:    $NULLIFIER_HEX"
echo "Expected Root: $EXPECTED_ROOT_HEX"

echo "=== Depositing 500 USDC ==="
# 500 USDC (500 * 10^7 = 5000000000)
stellar contract invoke \
  --id "$TEST_POOL_ID" \
  --source test-user \
  --network testnet \
  -- \
  deposit \
  --depositor "$TEST_USER_ADDRESS" \
  --token "$USDC_SAC_ID" \
  --amount 5000000000 \
  --commitment "$COMMITMENT"

# Retrieve pool Merkle root
POOL_ROOT=$(stellar contract invoke --id "$TEST_POOL_ID" --network testnet -- get_root | jq -r .)
echo "Pool root after deposit: $POOL_ROOT"

if [ "$POOL_ROOT" != "$EXPECTED_ROOT_HEX" ]; then
  echo "Warning: Pool root ($POOL_ROOT) does not match expected root ($EXPECTED_ROOT_HEX)!"
fi

echo "=== Creating Recipient Account and Trustline ==="
if ! stellar keys address recipient >/dev/null 2>&1; then
  stellar keys generate recipient --network testnet --fund
else
  echo "Recipient account already exists."
fi
RECIPIENT_ADDR=$(stellar keys address recipient)
echo "Recipient Address: $RECIPIENT_ADDR"

# Setup recipient trustline to EURC
# Helper function to check if a trustline exists on testnet
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

if ! has_trustline "$RECIPIENT_ADDR" "EURC" "$EURC_ISSUER_ADDRESS"; then
  echo "Establishing trustline to EURC for recipient..."
  stellar tx new change-trust --source-account recipient --line "EURC:$EURC_ISSUER_ADDRESS" --network testnet \
    | stellar tx sign --source recipient --network testnet \
    | stellar tx send --network testnet
fi

echo "=== Withdrawing 460 EURC via ZK Proof ==="
# 460 EURC (460 * 10^7 = 4600000000)
stellar contract invoke \
  --id "$TEST_POOL_ID" \
  --network testnet \
  -- \
  withdraw \
  --recipient "$RECIPIENT_ADDR" \
  --asset_out "$EURC_SAC_ID" \
  --proof "$PROOF_HEX" \
  --nullifier_hash "$NULLIFIER_HEX" \
  --merkle_root "$POOL_ROOT" \
  --withdrawal_amount 4600000000

# Function to get balance
get_balance() {
  local addr=$1
  local code=$2
  local issuer=$3
  curl -s "https://horizon-testnet.stellar.org/accounts/$addr" \
    | jq -r ".balances[] | select(.asset_code==\"$code\" and .asset_issuer==\"$issuer\") | .balance" 2>/dev/null
}

FINAL_RECIPIENT_BALANCE=$(get_balance "$RECIPIENT_ADDR" "EURC" "$EURC_ISSUER_ADDRESS")
echo "=== Final Recipient EURC Balance: $FINAL_RECIPIENT_BALANCE ==="

if [ "$FINAL_RECIPIENT_BALANCE" = "460.0000000" ]; then
  echo "SUCCESS: Swap completed successfully!"
else
  echo "FAILURE: Recipient balance is not 460 EURC."
  exit 1
fi
