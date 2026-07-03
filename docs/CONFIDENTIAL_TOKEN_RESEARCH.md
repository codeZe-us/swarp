# Confidential Token Research

## Context and Repositories
The Stellar Confidential Token implementation aims to provide amount-hiding transfers while retaining address transparency. We have audited the following repositories:
- `OpenZeppelin/stellar-contracts` (feat/confidential-verifier-ultrahonk)
- `AhaLabs/stellar-confidential-token-demo` (forked/cloned)

## 1. Nethermind UltraHonk Verifier
- **Location**: `packages/tokens/src/confidential/verifier` in OZ stellar-contracts.
- **Optimization**: The OpenZeppelin Verifier is a lightweight registry contract that leverages `ultrahonk_soroban_verifier` (a dependency pointing to NethermindEth/rs-soroban-ultrahonk). Unlike ZendSwap's current `ultrahonk-verifier` contract, which manually validates G1 points in Wasm (causing the `Budget ExceededLimit` errors), the Nethermind dependency uses Protocol 26 batched host functions for G1 operations.
- **Adaptation Need**: We will deploy `contracts/nethermind-verifier` mimicking the OZ implementation, avoiding all manual Wasm scalar math.

## 2. Compliance Policy Engine
- **Location**: `packages/tokens/src/confidential/compliance` in OZ stellar-contracts.
- **Purpose**: A pluggable cross-contract interface `PolicyClient::is_authorized(e, account, token)`.
- **Adaptation Strategy**: We can strip out the complex ZK-KYC checks and Noir proof generation in the deposit path. Instead, the pool contract will implement a simple policy check (via `PolicyClient`), routing to an independent `contracts/oz-policy-engine` where an admin can maintain an `is_allowed` list on-chain.

## 3. View Keys & Selective Disclosure
- **Location**: Found across the `stellar-confidential-token-demo` web and auditor contracts.
- **Features**: Allows an admin/auditor public key to be registered. Transaction data (amount, assets) is encrypted to this key. Users can encrypt their own transaction history and selectively disclose it.
- **Adaptation Strategy**: Create `web/lib/disclosure.ts` using `@stellar/stellar-sdk` ECIES utilities, update the swap completion UI with a "Share with Auditor" button, and build `/verify` and `/audit` pages.

## Recommendations
1. Re-implement ZendSwap's `ultrahonk-verifier` using the direct Nethermind dependency to eliminate `Budget ExceededLimit`.
2. Adopt the OpenZeppelin Policy interface for KYC/allow-listing.
3. Integrate the View Key & Selective Disclosure utilities.
