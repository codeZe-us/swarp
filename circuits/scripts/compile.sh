#!/bin/bash
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CIRCUITS_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$CIRCUITS_DIR/build"
BIN_DIR="$CIRCUITS_DIR/bin"

export PATH="$BIN_DIR:$PATH"

if ! command -v circom >/dev/null 2>&1; then
    echo "Error: circom is not in PATH."
    exit 1
fi

echo "Compiling swap.circom..."
mkdir -p "$BUILD_DIR"

circom "$CIRCUITS_DIR/swap.circom" --r1cs --wasm --sym --output "$BUILD_DIR"

echo "Constraint information:"
npx snarkjs r1cs info "$BUILD_DIR/swap.r1cs"
