#!/usr/bin/env bash
# =============================================================================
# circuits/scripts/build.sh
# Compiles the Noir swap circuit, generates a witness from Prover.toml,
# creates an UltraHonk proof, and exports the Verification Key (VK).
#
# Prerequisites:
#   - nargo 1.0.0-beta.9 on PATH  (run setup-toolchain.sh first)
#   - bb    0.87.0       on PATH
#   - A valid circuits/Prover.toml (run compute-swap-witness.ts to generate)
#
# Usage:
#   cd circuits
#   ./scripts/build.sh
#
# Outputs:
#   target/swap.json     – compiled ACIR artifact
#   target/witness.gz    – compressed witness
#   target/proof         – UltraHonk proof bytes
#   target/vk            – Verification Key bytes (embed in Soroban contract)
# =============================================================================
set -euo pipefail

CIRCUITS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$CIRCUITS_DIR"

CYAN='\033[0;36m'; GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
step() { echo -e "${CYAN}[build]${NC} $*"; }
ok()   { echo -e "${GREEN}[build]${NC} $*"; }
die()  { echo -e "${RED}[build]${NC} $*" >&2; exit 1; }

# ── Sanity checks ─────────────────────────────────────────────────────────
command -v nargo &>/dev/null || die "nargo not found. Run ./scripts/setup-toolchain.sh first."
command -v bb    &>/dev/null || die "bb not found. Run ./scripts/setup-toolchain.sh first."

NARGO_VER=$(nargo --version 2>&1 | grep -oP '\d+\.\d+\.\d+.*' | head -1)
BB_VER=$(bb --version 2>&1 | grep -oP '\d+\.\d+\.\d+' | head -1)
step "Using nargo: ${NARGO_VER}"
step "Using bb   : ${BB_VER}"

# ── 1. Compile ─────────────────────────────────────────────────────────────
step "Compiling circuit..."
nargo compile
ok "Compiled → target/swap.json"

# ── 2. Execute (witness generation) ────────────────────────────────────────
step "Generating witness from Prover.toml..."
[ -f Prover.toml ] || die "Prover.toml not found. Run: npx tsx scripts/compute-swap-witness.ts"
nargo execute
ok "Witness → target/witness.gz"

ACIR="target/swap.json"
WITNESS="target/swap.gz"

# ── 3. Generate UltraHonk proof ─────────────────────────────────────────────
step "Generating UltraHonk proof..."
bb prove -b "$ACIR" -w "$WITNESS" -o target/proof
ok "Proof → target/proof/proof  ($(wc -c < target/proof/proof) bytes)"

# ── 4. Write Verification Key ───────────────────────────────────────────────
step "Writing Verification Key..."
bb write_vk -b "$ACIR" -o target/vk
ok "VK → target/vk/vk  ($(wc -c < target/vk/vk) bytes)"

# ── 5. Verify locally ───────────────────────────────────────────────────────
step "Verifying proof locally..."
bb verify -k target/vk/vk -p target/proof/proof -i target/proof/public_inputs
# ── 6. Deploy artifacts ─────────────────────────────────────────────────────
step "Deploying VK to contract..."
cp target/vk/vk ../contracts/ultrahonk-verifier/vk
ok "VK copied to contracts/ultrahonk-verifier/vk ✓"

step "Deploying swap.json to web app..."
cp target/swap.json ../web/public/swap.json
ok "swap.json copied to web/public/swap.json ✓"

echo ""
ok "Build and deploy complete!"
ok "  Proof : target/proof"
ok "  VK    : target/vk"
echo ""
