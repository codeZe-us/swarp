# Swarp: Private Stablecoin Exchange on Stellar

**Swarp** is a privacy-preserving decentralized exchange (DEX) built on Stellar, utilizing Zero-Knowledge Proofs (Noir & UltraHonk) to enable anonymous stablecoin swaps and ZK-KYC compliance. 

This project was built for the **"Real-World ZK on Stellar" Hackathon**.

## Vision

Public blockchains expose financial history. In a world moving towards regulated stablecoins, institutions and retail users need a way to trade and exchange stablecoins without broadcasting their entire portfolio, trading strategies, or identity to the world.

Swarp solves this by splitting the DEX flow into two layers:
1. **Public Liquidity Pool (Stellar Smart Contracts):** Holds the actual USDC, EURC, XLM, etc.
2. **Private Identity & State (Zero-Knowledge Proofs):** User balances, swap parameters, and KYC status are proven in the browser using Noir and verified on-chain via UltraHonk.

## Architecture & How It Works

Swarp leverages a novel architecture using Web Workers, Noir, and Soroban to ensure end-to-end privacy and decentralization. The architecture is split across three main domains:

### 1. The Noir Circuits (Zero-Knowledge Logic)
The core privacy logic is defined in two separate Noir circuits:
- **Swap Circuit (`/circuits/src/main.nr`):** This circuit is responsible for validating the mathematics of a swap without revealing the inputs to the blockchain. It takes a user's private encrypted "note" (representing their current deposit balance) and their desired trade parameters. The circuit proves that the user owns the input note, calculates the exchange rate using the constant product formula (or exact output constraints), and computes a valid output note. Only the cryptographic commitment of this output note is revealed on-chain.
- **KYC Circuit (`/kyc_circuit/src/main.nr`):** This circuit provides privacy-preserving identity verification. It proves that a user's wallet address corresponds to a valid credential inside an approved Merkle tree of KYC-verified users. It checks that the credential has not expired and was signed by an authorized issuer, all without revealing *which* specific credential belongs to the user or any underlying personal data.

### 2. Browser-side Proving (Client Privacy)
User privacy dictates that sensitive data must never leave the user's device. To achieve this, Swarp compiles the Noir circuits into WebAssembly and executes the proving process entirely within the user's browser. 
- **Web Workers (`/web/workers/`):** The heavy computation required for proof generation is offloaded to background Web Workers (`prover.worker.ts` and `kyc.worker.ts`), preventing the main UI thread from freezing.
- **UltraHonk Backend:** The application utilizes `@aztec/bb.js` with the `keccak: true` flag to generate a highly efficient UltraHonk proof that can be verified on-chain.

### 3. Soroban Smart Contracts (On-Chain Settlement)
Once a proof is generated locally, it is submitted to the Stellar network where Soroban smart contracts manage the state and verification:
- **ZendSwap Pool (`/contracts/zendswap-pool-multi`):** This is the main state machine of the DEX. It manages multi-asset liquidity across supported tokens (USDC, EURC, XLM, MGUSD, YLDS). It handles public deposits, tracks the ZK-KYC verification status of connected wallets, and processes the two-step withdrawal/swap flow safely.
- **UltraHonk Verifier (`/contracts/ultrahonk-verifier`):** Because cryptographic verification is computationally intensive, the proof verification logic is isolated in a specialized Soroban contract. The pool contract calls this verifier to cryptographically guarantee the integrity of the user's Noir proof before accepting any state changes.

## Honest Work-In-Progress (Hackathon State)

As requested by the judges, here is the transparent state of the project. We aimed high and built a lot, but some parts are still using mock data or are unfinished:

*   **ZK-KYC Implementation:** The UI, Web Worker, and Noir circuit for KYC are fully built and working! The browser successfully generates an UltraHonk ZK proof locally. We provide a mock API (`/api/kyc-mock-data`) to simulate a decrypted user credential. Note that for the hackathon demo, while the smart contract is fully initialized and successfully processes the `submitVerifyKyc` transaction on-chain, the strict Merkle root on-chain verification is disabled (`enabled = false`) to bypass edge cases with dynamic tree updates and allow a smooth demo. The UI flow perfectly showcases the browser-side UltraHonk proving and transaction submission!
*   **Encrypted Notes Storage:** The cryptographic functions to encrypt/decrypt UTXO notes using AES-GCM are implemented (`crypto.ts`), but for the sake of the hackathon demo, state management is largely handled in local browser state rather than fully decentralized encrypted blob storage.
*   **Two-Transaction Flow:** Soroban contract sizes and compute limits meant we had to split the proof verification and the actual token withdrawal/swap execution into two separate transactions. The first transaction verifies the proof and stores a temporary TTL state, and the second executes the withdrawal.

## Tech Stack

*   **Smart Contracts:** Rust, Soroban SDK
*   **Zero-Knowledge:** Noir (Noir JS), Aztec UltraHonk (`bb.js`)
*   **Frontend:** Next.js (React), TailwindCSS, Zustand (State Management)
*   **Wallet Integration:** Freighter API, Stellar Wallets Kit

## Codebase Overview

*   `circuits/`: Noir source code for the main swap logic.
*   `kyc_circuit/`: Noir source code for the ZK-KYC verification.
*   `contracts/zendswap-pool-multi/`: The core Soroban liquidity pool contract.
*   `contracts/ultrahonk-verifier/`: The UltraHonk proof verifier contract.
*   `web/`: The Next.js frontend application.
    *   `web/app/`: Next.js App Router pages (Swap, KYC, Pool, etc.)
    *   `web/workers/`: Web Workers for running heavy ZK proving off the main thread.
    *   `web/lib/`: Core utilities (`contracts.ts`, `crypto.ts`, `prover.ts`, `stellar.ts`).

## Getting Started (Local Development)

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

---
*Built for the Stellar Ecosystem.*
