#!/bin/bash
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CIRCUITS_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$CIRCUITS_DIR/build"

R1CS_FILE="$BUILD_DIR/swap.r1cs"
PTAU_FILE="$BUILD_DIR/powersOfTau28_hez_final_15.ptau"

if [ ! -f "$R1CS_FILE" ]; then
    echo "Error: Compiled R1CS file not found at $R1CS_FILE."
    exit 1
fi

if [ ! -f "$PTAU_FILE" ]; then
    echo "Error: PTAU file not found at $PTAU_FILE."
    exit 1
fi

echo "Running setup..."
npx snarkjs groth16 setup "$R1CS_FILE" "$PTAU_FILE" "$BUILD_DIR/swap_0000.zkey"

echo "Contributing randomness..."
npx snarkjs zkey contribute "$BUILD_DIR/swap_0000.zkey" "$BUILD_DIR/swap_final.zkey" \
  --name="Local Contributor" -v -e="local trusted setup hackathon"

echo "Exporting verification key..."
npx snarkjs zkey export verificationkey "$BUILD_DIR/swap_final.zkey" "$BUILD_DIR/verification_key.json"

rm -f "$BUILD_DIR/swap_0000.zkey"

echo "------------------------------------------------------------"
echo "WARNING: This is a local trusted setup not suitable for production!"
echo "------------------------------------------------------------"
echo "Keys generated successfully."
