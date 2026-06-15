import { 
  Address, 
  Keypair, 
  rpc, 
  xdr, 
  TransactionBuilder, 
  Networks, 
  Operation 
} from '@stellar/stellar-sdk';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

// Path to compiled WebAssembly bytecode
const WASM_PATH = path.resolve(__dirname, '../../contracts/target/wasm32-unknown-unknown/release/swarp_contracts.wasm');

async function deploy() {
  const secretKey = process.env.DEPLOYER_SECRET_KEY;
  const publicKey = process.env.DEPLOYER_PUBLIC_KEY;
  const rpcUrl = process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
  const networkPassphrase = process.env.STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET;

  if (!secretKey || secretKey === 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA') {
    console.warn('Deployer secret key is using the placeholder. Please configure DEPLOYER_SECRET_KEY in scripts/.env');
    console.log('Skipping execution. To execute deployment, fund a real testnet account and add its secret to .env');
    return;
  }

  console.log(`Connecting to Soroban RPC: ${rpcUrl}`);
  const server = new rpc.Server(rpcUrl);
  const sourceKeypair = Keypair.fromSecret(secretKey);

  // Check if WASM file exists
  if (!fs.existsSync(WASM_PATH)) {
    console.error(`WASM file not found at: ${WASM_PATH}`);
    console.error('Please run "pnpm build:contracts" first to compile the contracts.');
    process.exit(1);
  }

  const wasmBytecode = fs.readFileSync(WASM_PATH);
  console.log(`Loaded WASM bytecode (${wasmBytecode.length} bytes)`);

  try {
    console.log(`Fetching account sequence for: ${sourceKeypair.publicKey()}`);
    const account = await server.getAccount(sourceKeypair.publicKey());
    
    console.log('--- Deployment steps to perform ---');
    console.log('1. Upload WASM byte code using stellar-sdk uploadContractWasm');
    console.log('2. Deploy contract instance using stellar-sdk createContract');
    console.log('3. Save contract ID to environment configurations');
    console.log('--------------------------------------------------');
    console.log('Ensure you fund your Stellar public address on testnet using the Friendbot faucet.');
  } catch (error) {
    console.error('Deployment execution failed:', error);
  }
}

deploy().catch(console.error);
