"use strict";
/// <reference types="node" />
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * circuits/scripts/compute-swap-witness.ts
 *
 * Computes all Poseidon hashes and Merkle-path vectors needed for the
 * ZendSwap Noir circuit and writes them to circuits/Prover.toml.
 *
 * The Poseidon2 implementation used here matches Noir's built-in
 * std::hash::poseidon2 (BN254 scalar field, width-4 state).
 *
 * Usage (from project root):
 *   npx tsx circuits/scripts/compute-swap-witness.ts
 *
 * Outputs:
 *   circuits/Prover.toml   – witness file consumed by `nargo execute`
 *
 * Zero-Value Leaf Convention
 * ──────────────────────────
 * Empty leaves are Poseidon2([0, 0, 0, 0]).slice(0,1) → i.e., Poseidon2 of a
 * single-element vector [0]. Each subsequent zero-subtree:
 *   zeros[0] = Poseidon2([0])               (single-input hash)
 *   zeros[i] = Poseidon2([zeros[i-1], zeros[i-1]])  (pair hash, i > 0)
 * The Soroban pool contract uses env.crypto().poseidon2_hash([0]) for zeros[0].
 */
const poseidon2_1 = require("@zkpassport/poseidon2");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const DEPOSIT_AMOUNT = 500n;
const EXCHANGE_RATE = 9200000n;
const RATE_DENOMINATOR = 10000000n;
const WITHDRAWAL_AMOUNT = DEPOSIT_AMOUNT * EXCHANGE_RATE / RATE_DENOMINATOR;
const ASSET_IN = 0n;
const ASSET_OUT = 1n;
const SECRET = BigInt('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');
const TREE_DEPTH = 20;
function toHex(n) {
    return '0x' + n.toString(16).padStart(64, '0');
}
function toField(n) {
    return n.toString(10);
}
async function main() {
    const commitment = (0, poseidon2_1.poseidon2Hash)([DEPOSIT_AMOUNT, ASSET_IN, SECRET]);
    const nullifierHash = (0, poseidon2_1.poseidon2Hash)([commitment, SECRET]);
    const zeros = new Array(TREE_DEPTH);
    zeros[0] = (0, poseidon2_1.poseidon2Hash)([0n]);
    for (let i = 1; i < TREE_DEPTH; i++) {
        zeros[i] = (0, poseidon2_1.poseidon2Hash)([zeros[i - 1], zeros[i - 1]]);
    }
    const pathElements = zeros.slice(0, TREE_DEPTH);
    const pathIndices = new Array(TREE_DEPTH).fill(0);
    let current = commitment;
    for (let i = 0; i < TREE_DEPTH; i++) {
        current = (0, poseidon2_1.poseidon2Hash)([current, zeros[i]]);
    }
    const merkleRoot = current;
    const lines = [
        `deposit_amount    = "${toField(DEPOSIT_AMOUNT)}"`,
        `withdrawal_amount = "${toField(WITHDRAWAL_AMOUNT)}"`,
        `secret            = "${toHex(SECRET)}"`,
        `asset_in          = "${toField(ASSET_IN)}"`,
        `asset_out         = "${toField(ASSET_OUT)}"`,
        `path_elements = [${pathElements.map(e => `"${toHex(e)}"`).join(', ')}]`,
        `path_indices = [${pathIndices.join(', ')}]`,
        `exchange_rate    = "${toField(EXCHANGE_RATE)}"`,
        `rate_denominator = "${toField(RATE_DENOMINATOR)}"`,
        `nullifier_hash   = "${toHex(nullifierHash)}"`,
        `asset_out_public = "${toField(ASSET_OUT)}"`,
        `merkle_root      = "${toHex(merkleRoot)}"`
    ];
    const scriptDir = typeof __dirname !== 'undefined'
        ? __dirname
        : path.dirname(process.argv[1] ?? '');
    const outputPath = path.resolve(scriptDir, '..', 'Prover.toml');
    fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
