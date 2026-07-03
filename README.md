# Swarp: Private Stablecoin Exchange on Stellar 🛡️💱

**Swarp** is a privacy-preserving decentralized exchange (DEX) built on Stellar, utilizing Zero-Knowledge Proofs (Noir & UltraHonk) to enable anonymous stablecoin swaps and ZK-KYC compliance. 

This project was built for the **"Real-World ZK on Stellar" Hackathon**.

## 🌟 Vision

Public blockchains expose financial history. In a world moving towards regulated stablecoins, institutions and retail users need a way to trade and exchange stablecoins without broadcasting their entire portfolio, trading strategies, or identity to the world.

Swarp solves this by splitting the DEX flow into two layers:
1. **Public Liquidity Pool (Stellar Smart Contracts):** Holds the actual USDC, EURC, XLM, etc.
2. **Private Identity & State (Zero-Knowledge Proofs):** User balances, swap parameters, and KYC status are proven in the browser using Noir and verified on-chain via UltraHonk.

## 🏗️ Architecture & How It Works

Swarp leverages a novel architecture using Web Workers, Noir, and Soroban:

### 1. The Noir Circuits (`/circuits/src/main.nr`, `/kyc_circuit/src/main.nr`)
- **Swap Circuit:** Proves that a user owns a valid encrypted "note" (representing a deposit), and computes the valid output note after a swap, ensuring the constant product formula (or exact output constraints) without revealing the amounts on-chain.
- **KYC Circuit:** Proves a user's wallet address is part of an approved Merkle tree of KYC-verified credentials, checking expiry and issuer signatures, without revealing *which* leaf they are.

### 2. Browser-side Proving (`/web/workers/`)
- User privacy means data should never leave the device. Swarp compiles Noir circuits to WebAssembly and runs the prover directly in the user's browser via Web Workers (`prover.worker.ts` and `kyc.worker.ts`).
- It uses `@aztec/bb.js` with `keccak: true` to generate an UltraHonk proof.

### 3. Soroban Smart Contracts (`/contracts/`)
- **ZendSwap Pool (`zendswap-pool-multi`):** Manages multi-asset liquidity (USDC, EURC, XLM, MGUSD, YLDS). It handles deposits, tracks the ZK-KYC status of wallets, and processes the two-step withdrawal/swap flow.
- **UltraHonk Verifier (`ultrahonk-verifier`):** A specialized Soroban contract generated to verify the cryptographic integrity of the Noir proofs on-chain.

## 🚀 Honest Work-In-Progress (Hackathon State)

As requested by the judges, here is the transparent state of the project. We aimed high and built a lot, but some parts are still using mock data or are unfinished:

*   **ZK-KYC Implementation:** The UI, Web Worker, and Noir circuit for KYC are fully built and working! The browser successfully generates a ZK proof. However, the exact dynamic Merkle root state on the deployed pool contract is currently uninitialized (due to a CLI array parsing issue on Windows during deployment). The UI simulates the on-chain submission, but an unpatched Soroban contract would panic on an invalid root. We provide a mock API (`/api/kyc-mock-data`) to simulate a decrypted user credential.
*   **Encrypted Notes Storage:** The cryptographic functions to encrypt/decrypt UTXO notes using AES-GCM are implemented (`crypto.ts`), but for the sake of the hackathon demo, state management is largely handled in local browser state rather than fully decentralized encrypted blob storage.
*   **Two-Transaction Flow:** Soroban contract sizes and compute limits meant we had to split the proof verification and the actual token withdrawal/swap execution into two separate transactions. The first transaction verifies the proof and stores a temporary TTL state, and the second executes the withdrawal.

## 🛠️ Tech Stack

*   **Smart Contracts:** Rust, Soroban SDK
*   **Zero-Knowledge:** Noir (Noir JS), Aztec UltraHonk (`bb.js`)
*   **Frontend:** Next.js (React), TailwindCSS, Zustand (State Management)
*   **Wallet Integration:** Freighter API, Stellar Wallets Kit

## 📂 Codebase Overview

*   `circuits/`: Noir source code for the main swap logic.
*   `kyc_circuit/`: Noir source code for the ZK-KYC verification.
*   `contracts/zendswap-pool-multi/`: The core Soroban liquidity pool contract.
*   `contracts/ultrahonk-verifier/`: The UltraHonk proof verifier contract.
*   `web/`: The Next.js frontend application.
    *   `web/app/`: Next.js App Router pages (Swap, KYC, Pool, etc.)
    *   `web/workers/`: Web Workers for running heavy ZK proving off the main thread.
    *   `web/lib/`: Core utilities (`contracts.ts`, `crypto.ts`, `prover.ts`, `stellar.ts`).

## 🏃‍♂️ Getting Started (Local Development)

### Prerequisites
*   Node.js (v18+) & pnpm
*   Rust & Soroban CLI
*   Nargo (Noir compiler)

### Frontend Setup
```bash
cd web
pnpm install
# The postinstall script will patch bb.js for Next.js compatibility
pnpm run build
pnpm run dev
```

### Smart Contract Deployment
Use the scripts in `/scripts/` to deploy to Futurenet or Testnet.
```bash
# Example
./scripts/deploy_pool.bat
```

## 👥 Team
*   No dummy team members here—just the core builders who hacked on this!

---
*Built with ❤️ for the Stellar Ecosystem.*
