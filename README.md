# Swarp

A pnpm monorepo workspace for Swarp, a platform combining Next.js, Soroban (Stellar) smart contracts, and Circom ZK circuits.

## What it does

Swarp is a decentralized application designed to enable private, verifiable interactions and swaps on the Stellar network. By utilizing Soroban smart contracts for transaction execution and Circom zero-knowledge circuits for off-chain privacy/verification, Swarp allows users to perform interactions without exposing sensitive data on-chain.

## Architecture

This project is organized as a pnpm monorepo workspace:

```
swarp/
├── circuits/      # Noir ZK circuits, proofs, and verification setups
├── contracts/     # Rust/Soroban smart contracts (ZendSwap Pool, OZ Policy Engine)
├── scripts/       # Deployment, setup, and configuration scripts
├── web/           # Next.js frontend application (TypeScript + Tailwind CSS)
├── package.json   # Root workspace configurations and task triggers
└── pnpm-workspace.yaml
```

## Key Features

1. **Confidential Swaps**: Users can deposit assets publicly and withdraw them anonymously through a shielding pool, breaking the on-chain link between the deposit and withdrawal using Zero-Knowledge proofs.
2. **On-chain Compliance Engine**: Integrates OpenZeppelin's `PolicyClient` pattern. The ZendSwap Pool delegates deposit authorization to a centralized registry (`oz-policy-engine`), ensuring only whitelisted or verified users can interact with the pool without storing KYC data in the core protocol.
3. **Selective Disclosure**: Users retain the ability to decrypt and share specific transaction details (deposit/withdrawal amounts, assets, and timestamps) with an authorized third party (e.g., an auditor) using Elliptic Curve Integrated Encryption Scheme (ECIES).
4. **Nethermind UltraHonk Verifier**: On-chain verification of the withdrawal ZK proofs is performed natively in Soroban using Nethermind's `ultrahonk-verifier` to optimize for resource limits.

## How to run

### Prerequisites

- **Node.js**: v20 LTS (pinned via `.nvmrc`)
- **pnpm**: Fast, disk-efficient package manager
- **Rust & Cargo**: Required for compiling Soroban contracts
- **Circom**: Required to compile zero-knowledge circuits

### Installation

Install workspace dependencies from the root directory:

```bash
pnpm install
```

### Build Commands

You can build individual components using root-level scripts:

- **Build Next.js Frontend**:
  ```bash
  pnpm build:web
  ```
- **Build Soroban Contracts**:
  ```bash
  pnpm build:contracts
  ```
- **Build ZK Circuits**:
  ```bash
  pnpm build:circuits
  ```

### Run Tests

To execute all tests across packages in the monorepo:

```bash
pnpm test:all
```

### Deployment

To deploy the Soroban contracts to Stellar Testnet:

```bash
pnpm deploy:testnet
```

## Demo video

[Watch the Demo Video (Placeholder)](https://github.com/stellar/swarp)

## Known limitations

- **Client-Side Proof Generation**: Generating large ZK proofs on lower-end client devices may suffer from latency.
- **Soroban Network Limits**: Soroban CPU/memory transaction limits might require optimization for complex state verifications.

## Future work

- **Multi-Asset Pool Support**: Extend contracts to handle generic token-to-token swaps.
- **Recursive Proofs**: Integrate recursive SNARK proof-aggregation to reduce on-chain verification costs.

## Built with

- **Next.js** - React application framework
- **TypeScript** - Strongly typed programming language
- **Soroban SDK** - Smart contract platform for the Stellar network
- **Noir & UltraHonk** - ZK DSL compiler and Nethermind Soroban verifier
- **OpenZeppelin** - Smart contract primitives for Stellar (Confidential Tokens, Policy Engine)
- **pnpm** - Workspace package manager
- **Cargo** - Rust build system and package manager
