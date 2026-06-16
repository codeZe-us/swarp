#!/bin/bash
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CIRCUITS_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$CIRCUITS_DIR/build"

INPUT_JSON="$1"

if [ -z "$INPUT_JSON" ]; then
    echo "Usage: $0 <path_to_input_json>"
    exit 1
fi

if [ ! -f "$INPUT_JSON" ]; then
    echo "Error: Input JSON file not found at $INPUT_JSON"
    exit 1
fi

WASM_FILE="$BUILD_DIR/swap_js/swap.wasm"
ZKEY_FILE="$BUILD_DIR/swap_final.zkey"
VKEY_FILE="$BUILD_DIR/verification_key.json"

if [ ! -f "$WASM_FILE" ]; then
    echo "Error: WASM file not found at $WASM_FILE."
    exit 1
fi

if [ ! -f "$ZKEY_FILE" ]; then
    echo "Error: ZKEY file not found at $ZKEY_FILE."
    exit 1
fi

if [ ! -f "$VKEY_FILE" ]; then
    echo "Error: Verification key file not found at $VKEY_FILE."
    exit 1
fi

echo "Generating proof..."
npx snarkjs groth16 fullprove "$INPUT_JSON" "$WASM_FILE" "$ZKEY_FILE" "$BUILD_DIR/proof.json" "$BUILD_DIR/public.json"

echo "Verifying proof..."
if npx snarkjs groth16 verify "$VKEY_FILE" "$BUILD_DIR/public.json" "$BUILD_DIR/proof.json"; then
    echo "SUCCESS: Proof generated and verified successfully!"
else
    echo "FAILURE: Proof verification failed!"
    exit 1
fi
