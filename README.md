# Swarp

> Private stablecoin exchange on Stellar using zero-knowledge proofs

Swarp is a decentralized application that enables users to swap between stablecoins on the Stellar network privately. Using zero-knowledge proofs (ZKPs), Swarp obscures withdrawal amounts, counterparty links, and FX conversion routes, ensuring that financial activity remains confidential on a public ledger.

This project was built for the **Real-World ZK on Stellar** hackathon. 

---

## 📖 What it does

On public blockchains like Stellar, stablecoin transfers and swaps are fully transparent. Anyone can see how much you sent, what asset you traded, and who you interacted with. For businesses paying employees, freelancers receiving cross-border payments, or remittance users, this lack of privacy is a major barrier to adoption. 

Swarp solves this by offering a **shielded FX pool**. It allows users to deposit one stablecoin (e.g., USDC) and privately withdraw a different stablecoin (e.g., EURC) at a protocol-defined exchange rate, without leaving a publicly traceable link between the deposit and the withdrawal. 

Unlike standard privacy pools that only support "deposit asset A, withdraw asset A," Swarp natively integrates an internal AMM/rate table. This enables true private exchanges. 

## 🛠 How it works (User Perspective)

1. **Connect Wallet:** The user connects their Freighter wallet on the Stellar testnet.
2. **Deposit (Public):** The user deposits a stablecoin (e.g., USDC) into the Swarp shielded pool. This transaction is visible on the ledger, but the user is issued a private "Note" representing their claim.
3. **Select Withdrawal (Private):** When the user wants to withdraw, they select a *different* stablecoin (e.g., EURC). The UI calculates the output amount based on the pool's exchange rate.
4. **Generate Proof:** A zero-knowledge proof is generated entirely in the user's browser (taking ~5-20 seconds). The proof cryptographically proves that the user owns a valid unspent note in the pool and that the output amount correctly matches the input amount * exchange rate.
5. **Withdraw (Shielded):** The proof is submitted to the Stellar network in two steps (Verify and Execute). The user receives the output stablecoin to a new address. Observers see a withdrawal happen, but cannot link it to the original deposit.

## 🧠 How ZK works in Swarp (Technical)

Swarp leverages the **UltraHonk** proving system compiled via **Noir**.

- **Poseidon Commitments:** When a user deposits, the UI generates a random secret and hashes it together with the deposit amount and asset ID using a Poseidon hash function. This hash (the "commitment") is inserted into an on-chain Merkle tree.
- **The Noir Circuit:** The circuit proves:
  - **Merkle Inclusion:** The commitment exists in the current on-chain Merkle tree.
  - **Nullifier Generation:** A deterministic nullifier is generated from the secret to prevent double-spending.
  - **Conservation of Value:** `withdrawal_amount = deposit_amount * exchange_rate / rate_denominator`.
  - **Range Proofs:** All amounts fit securely within 64-bit bounds.
  - **Asset Validity:** `asset_in != asset_out` (forcing a swap).
- **Client-Side Proving:** The Noir circuit is compiled to WebAssembly. The proof is generated entirely client-side in a Web Worker using `@aztec/bb.js` and `@noir-lang/noir_js`. The user's secrets never leave their browser.
- **On-Chain Verification:** The proof is verified by a Soroban smart contract using the native Protocol 25/26 BN254 host functions.
- **Two-Transaction Split:** Because UltraHonk verification is computationally intensive, Soroban's transaction resource limits are easily exceeded if verification and token transfers happen in the same invocation. Swarp splits this into two steps: `verify_withdrawal` (verifies ZKP and marks nullifier spent) and `execute_withdrawal` (transfers the actual tokens).

## 🏗 Architecture

```text
+-------------------+       +--------------------+       +--------------------+
|  User's Browser   |       |   Next.js Server   |       |  Stellar Testnet   |
|                   |       |                    |       |                    |
| +---------------+ |       | +----------------+ |       | +----------------+ |
| |   Next.js UI  | |<----->| |  API Routes    | |       | | Zendswap Pool  | |
| +---------------+ |       | | (KYC, Config)  | |       | | - Merkle Tree  | |
|                   |       | +----------------+ |       | | - Rate Table   | |
| +---------------+ |       +--------------------+       | | - Nullifiers   | |
| |  Web Worker   | |                                    | +----------------+ |
| | (bb.js Prover)| |----------------------------------->|         |          |
| +---------------+ |         Submit Proof (XDR)         | +----------------+ |
|                   |                                    | |   UltraHonk    | |
| +---------------+ |                                    | |   Verifier     | |
| | localStorage  | |                                    | +----------------+ |
| | (Encrypted    | |                                    |         |          |
| |  Notes)       | |                                    | +----------------+ |
| +---------------+ |                                    | | SAC Contracts  | |
+-------------------+                                    | | (USDC, EURC)   | |
                                                         | +----------------+ |
                                                         +--------------------+
```

## ✨ Features (What actually works)

- **Multi-asset private swap:** Fully working. Currently supports USDC, EURC, MGUSD, YLDS, and XLM on testnet.
- **Any-to-any swapping:** Fully working. A single unified pool contract handles all asset pairs dynamically.
- **Client-side ZK proof generation:** Fully working via Web Workers.
- **On-chain UltraHonk verification:** Fully working using the two-transaction split pattern.
- **Note management:** Fully working. Notes are stored in `localStorage` and managed across tabs.
- **Auditor Portal:** Working UI for decrypting selective disclosures.

*Note on Unfinished Features:* The UI contains tabs for "Team" (multi-sig team management), "Payroll" (private batch payments), and "KYC" (compliance registry). These are **UI-complete but currently use mock data or execute public token transfers instead of private ZK transfers**. They demonstrate the vision for Swarp but are not fully wired to ZK circuits yet.

## 💻 Tech Stack

- **Noir:** 1.0.0-beta.9
- **Prover Backend:** `@aztec/bb.js` (0.87.0)
- **Soroban SDK:** v22.0.0
- **Frontend:** Next.js (16.2.9), React (19.2.4), TypeScript, Tailwind CSS
- **Wallet Integration:** Stellar Wallets Kit (`@creit.tech/stellar-wallets-kit`), Freighter API
- **Cryptography:** `circomlibjs` (for client-side Poseidon), `tweetnacl` (for encryption)
- **State Management:** Zustand
- **Bundler:** ESBuild (for the Web Worker)

## 📜 Smart Contracts (Testnet)

- **Pool Contract:** `CCPAUFGNCXXXJZJH6WGS2UGBMDSCVASWHZH5UMXONRKR7KNFNZE3UR27`
- **UltraHonk Verifier:** `CC6EIDRNEJGIT2E6HN5SYLGNYLOU7YZMST37NY7T562I5AK4PIW735PI`
- **USDC SAC:** `CDTGDHE3GHSNIYMRHBN7PMSGXXR73KHZ4KS2ZEBAIDOS6THPOLMHL5LG`
- **EURC SAC:** `CD6KJAOC4OQ2LQC4WQZHUFW2SMINOPC6SXUOCKN5UAX2KHVBSXUXQIDG`

## 🚀 How to Run

**Prerequisites:** Node.js 20+, `pnpm`, Rust (stable), Freighter browser extension (configured for Testnet).

```bash
# 1. Clone the repository
git clone <repo-url>
cd swarp

# 2. Install frontend dependencies
cd web
pnpm install

# 3. Build the proof Web Worker
pnpm run build:worker

# 4. Set up environment variables
cp .env.example .env.local
# (Ensure testnet contract IDs are configured in .env.local)

# 5. Start the frontend
pnpm run dev
```

Open `http://localhost:3000` in your browser. Ensure your Freighter wallet is set to Testnet and funded with test XLM.

*(Optional)* To compile the smart contracts:
```bash
cd contracts
cargo build --release --target wasm32v1-none
```

## 🛠 Technical Challenges

Building Swarp surfaced several complex engineering challenges:

1. **The Keccak vs. Poseidon Transcript Mismatch:** Initially, all proofs generated in the browser failed silently on-chain. We discovered that the UltraHonk verifier contract (generated by Soroban tools) defaults to a Keccak-based Fiat-Shamir transcript, but the Noir JS client was defaulting to a Poseidon transcript. We had to explicitly configure the `UltraHonkBackend` with `{ keccak: true }` in our Web Worker to align the transcripts.
2. **Soroban Resource Limits & The Two-Transaction Split:** UltraHonk verification is computationally expensive. Attempting to verify the proof, check the nullifier, and execute the token transfer in a single `invokeHostFunction` call consistently hit the Soroban CPU instruction limit. We architected a two-step flow (`verify_withdrawal` then `withdraw`) to spread the computational load across two separate transactions.
3. **Transaction Malformed Errors (Fee Bumping):** We encountered `txMalformed` (-16) errors when attempting to bump the transaction fee after `assembleTransaction`. We realized that `TransactionBuilder.cloneFrom` in older versions of the Stellar SDK drops the `sorobanData` (footprints) required for host invocations. We fixed this by setting the correct fee initially and bypassing the clone step.
4. **Webpack & WASM Conflicts:** Integrating `@aztec/bb.js` into a Next.js application caused severe Webpack bundling issues. We resolved this by isolating the prover logic entirely inside a dedicated Web Worker and compiling it separately using `esbuild`.

## 🔒 Security & Privacy Model

- **Public Data:** Deposit amounts, deposited asset type, and the depositor's Stellar address are public.
- **Private Data:** Withdrawal amounts, withdrawn asset type, the recipient address, and the cryptographic link between deposit and withdrawal are entirely hidden.
- **Unlinkability:** Privacy is achieved through an anonymity set. An observer sees a pool of deposits and a pool of withdrawals, but the ZK proof ensures that no one can determine *which* deposit funded *which* withdrawal.
- **Client-Side Secrets:** Blinding factors (secrets) are generated in the browser and never transmitted. Notes are encrypted using a key derived from the user's wallet and stored locally in `localStorage`.
- **Checks-Effects-Interactions:** The pool contract registers the nullifier *before* transferring tokens to prevent re-entrancy or double-spending.

## 🔮 Future Work

- **ZK-KYC Integration:** Wiring the existing KYC UI to an on-chain compliance registry using selective disclosure ZKPs.
- **Private Payroll:** Implementing the sum-check protocol to allow a single large deposit to fund multiple smaller, confidential employee withdrawals.
- **Confidential Tokens (CT):** Wrapping Stellar's upcoming Confidential Tokens inside the Swarp pool for double-layer privacy (hiding amounts on deposit as well).
- **Oracle-Fed Rates:** Dynamically updating the internal pool exchange rates using a Soroban oracle rather than admin-set rates.

## 📚 Hackathon Resources Used

We leaned heavily on the following resources during development:
- **yugocabrio/rs-soroban-ultrahonk:** The core reference for the UltraHonk verifier contract.
- **Nethermind stellar-private-payments:** Architectural patterns for the Merkle tree and pool contract.
- **Noir Documentation & Stellar ZK Docs:** For building and testing the circuit.
- **Stellar Wallets Kit:** For seamless Freighter integration.

## 🌍 Where Swarp Fits in the Stellar Privacy Stack

Stellar currently has two primary privacy layers in development: **Confidential Tokens** (which hide transaction amounts but leave sender-receiver links visible) and **Privacy Pools** (which hide both amounts and sender-receiver links). Swarp operates at the privacy pool layer with the added capability of cross-asset conversion. In production, Swarp could be layered *on top* of Confidential Tokens (by swapping cUSDC for cEURC) to provide maximum end-to-end privacy for enterprise and retail users.

## ⚖️ License

MIT License.
