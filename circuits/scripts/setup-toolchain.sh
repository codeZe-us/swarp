#!/bin/bash
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CIRCUITS_DIR="$(dirname "$SCRIPT_DIR")"
BIN_DIR="$CIRCUITS_DIR/bin"
BUILD_DIR="$CIRCUITS_DIR/build"

mkdir -p "$BIN_DIR"
mkdir -p "$BUILD_DIR"

if command -v circom >/dev/null 2>&1; then
    CIRCOM_VER=$(circom --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
else
    CIRCOM_VER=""
fi

NEED_INSTALL=true
if [ ! -z "$CIRCOM_VER" ]; then
    MAJOR=$(echo "$CIRCOM_VER" | cut -d. -f1)
    MINOR=$(echo "$CIRCOM_VER" | cut -d. -f2)
    if [ "$MAJOR" -gt 2 ] || { [ "$MAJOR" -eq 2 ] && [ "$MINOR" -ge 1 ]; }; then
        NEED_INSTALL=false
    fi
fi

if [ "$NEED_INSTALL" = true ]; then
    if [ -f "$BIN_DIR/circom" ]; then
        LOCAL_VER=$("$BIN_DIR/circom" --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
        MAJOR=$(echo "$LOCAL_VER" | cut -d. -f1)
        MINOR=$(echo "$LOCAL_VER" | cut -d. -f2)
        if [ "$MAJOR" -gt 2 ] || { [ "$MAJOR" -eq 2 ] && [ "$MINOR" -ge 1 ]; }; then
            export PATH="$BIN_DIR:$PATH"
            NEED_INSTALL=false
        fi
    fi
fi

if [ "$NEED_INSTALL" = true ]; then
    echo "Installing Circom 2.1.6 natively..."
    curl -L -o "$BIN_DIR/circom" https://github.com/iden3/circom/releases/download/v2.1.6/circom-linux-amd64
    chmod +x "$BIN_DIR/circom"
    export PATH="$BIN_DIR:$PATH"
fi

export PATH="$BIN_DIR:$PATH"

if [ ! -d "$CIRCUITS_DIR/node_modules" ]; then
    echo "Installing node dependencies..."
    cd "$CIRCUITS_DIR" && pnpm install
fi

if [ ! -d "$CIRCUITS_DIR/node_modules/snarkjs" ]; then
    echo "Error: snarkjs is not available."
    exit 1
fi

PTAU_FILE="$BUILD_DIR/powersOfTau28_hez_final_15.ptau"
if [ ! -f "$PTAU_FILE" ]; then
    echo "Downloading Powers of Tau file..."
    curl -L -o "$PTAU_FILE" https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_15.ptau
fi

echo "Toolchain setup completed successfully."
