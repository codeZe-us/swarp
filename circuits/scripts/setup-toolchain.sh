#!/usr/bin/env bash
# =============================================================================
# circuits/scripts/setup-toolchain.sh
# Installs Noir (nargo) 1.0.0-beta.9 and Barretenberg (bb) 0.87.0.
#
# These exact versions are required to maintain compatibility with the
# NethermindEth/rs-soroban-ultrahonk on-chain verifier library.
# =============================================================================
set -euo pipefail

NOIR_VERSION="1.0.0-beta.9"
BB_VERSION="0.87.0"

# ── Colour helpers ─────────────────────────────────────────────────────────
CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${CYAN}[setup]${NC} $*"; }
success() { echo -e "${GREEN}[setup]${NC} $*"; }
warn()    { echo -e "${YELLOW}[setup]${NC} $*"; }
die()     { echo -e "${RED}[setup]${NC} $*" >&2; exit 1; }

# ── 1. Install / update noirup ─────────────────────────────────────────────
info "Installing noirup..."
if command -v noirup &>/dev/null; then
    warn "noirup already installed at $(which noirup)"
else
    curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
fi

# Ensure noirup is on PATH for the rest of this script
export PATH="$HOME/.nargo/bin:$PATH"

# ── 2. Pin Noir to required version ────────────────────────────────────────
info "Switching Noir to v${NOIR_VERSION}..."
noirup -v "${NOIR_VERSION}"

# Verify
INSTALLED_NARGO=$(nargo --version 2>&1 | grep -oP '\d+\.\d+\.\d+.*' | head -1)
info "nargo version: ${INSTALLED_NARGO}"
if [[ "${INSTALLED_NARGO}" != *"${NOIR_VERSION}"* ]]; then
    die "Expected Noir ${NOIR_VERSION}, got: ${INSTALLED_NARGO}"
fi
success "nargo ${NOIR_VERSION} ready."

# ── 3. Install / update bbup ───────────────────────────────────────────────
info "Installing bbup (Barretenberg version manager)..."
if command -v bbup &>/dev/null; then
    warn "bbup already installed at $(which bbup)"
else
    curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/cpp/installation/install | bash
fi

# Ensure bbup is on PATH
export PATH="$HOME/.bb:$PATH"

# ── 4. Pin Barretenberg to required version ────────────────────────────────
info "Switching Barretenberg to v${BB_VERSION}..."
bbup -v "${BB_VERSION}"

# Verify
INSTALLED_BB=$(bb --version 2>&1 | grep -oP '\d+\.\d+\.\d+' | head -1)
info "bb version: ${INSTALLED_BB}"
if [[ "${INSTALLED_BB}" != "${BB_VERSION}" ]]; then
    die "Expected Barretenberg ${BB_VERSION}, got: ${INSTALLED_BB}"
fi
success "bb ${BB_VERSION} ready."

# ── Done ───────────────────────────────────────────────────────────────────
echo ""
success "Toolchain setup complete!"
success "  nargo : ${INSTALLED_NARGO}"
success "  bb    : ${INSTALLED_BB}"
echo ""
info "Next step: run ./scripts/build.sh to compile, prove, and export the VK."
