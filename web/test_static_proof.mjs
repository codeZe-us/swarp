import fs from 'fs';
import { rpc, TransactionBuilder, Networks, nativeToScVal, Contract, Keypair, Account, xdr } from '@stellar/stellar-sdk';

async function main() {
    const proofHex = fs.readFileSync('../contracts/ultrahonk-verifier/static_proof.proof').toString('hex');
    const publicInputs = JSON.parse(fs.readFileSync('static_public_inputs.json', 'utf-8'));
    
    console.log('Static proof size:', proofHex.length / 2, 'bytes');
    console.log('Public inputs count:', publicInputs.length);
    publicInputs.forEach((pi, i) => console.log(`  [${i}]: ${pi}`));

    const rpcServer = new rpc.Server('https://soroban-testnet.stellar.org');
    const verifierId = 'CDYHALWA2NFRDOCHPMXPF4E3M5QLBQUSUHILRFV4BUDERQUXLERVORYL';
    const contract = new Contract(verifierId);
    
    const dummyKey = Keypair.random();
    const sourceAccount = new Account(dummyKey.publicKey(), '1');
    
    const args = [
        nativeToScVal(Buffer.from(proofHex, 'hex')),
        xdr.ScVal.scvVec(publicInputs.map(pi => xdr.ScVal.scvBytes(Buffer.from(pi, 'hex'))))
    ];
    
    const tx = new TransactionBuilder(sourceAccount, {
        fee: '10000000',
        networkPassphrase: Networks.TESTNET
    })
    .addOperation(contract.call('verify', ...args))
    .setTimeout(30)
    .build();
    
    console.log('\nSimulating static proof against testnet verifier...');
    const sim = await rpcServer.simulateTransaction(tx);
    
    if (rpc.Api.isSimulationError(sim)) {
        console.error('Simulation error:', sim.error);
    } else if (rpc.Api.isSimulationSuccess(sim)) {
        console.log('Return value:', sim.result.retval._switch.name, '=', sim.result.retval._value);
    }
}
main().catch(console.error);
