import fs from 'fs';
import { rpc, TransactionBuilder, Networks, nativeToScVal, Contract, Keypair, Account, xdr } from '@stellar/stellar-sdk';

async function main() {
    const proofHex = fs.readFileSync('proof.bin').toString('hex');
    const publicInputs = JSON.parse(fs.readFileSync('public_inputs.json', 'utf-8'));
    
    console.log('Proof size:', proofHex.length / 2, 'bytes');
    console.log('Public inputs count:', publicInputs.length);

    const rpcServer = new rpc.Server('https://soroban-testnet.stellar.org');
    
    // New verifier with custom curve validation removed
    const verifierId = 'CCGDD75FPM5I4TSA2QPGHCTRHOPPZDHOORDOC3V46Y6FN6AL3IUXA2O6';
    const contract = new Contract(verifierId);
    
    const dummyKey = Keypair.random();
    const sourceAccount = new Account(dummyKey.publicKey(), '1');
    
    const args = [
        nativeToScVal(Buffer.from(proofHex, 'hex')),
        xdr.ScVal.scvVec(publicInputs.map(pi => xdr.ScVal.scvBytes(Buffer.from(pi, 'hex'))))
    ];
    
    const tx = new TransactionBuilder(sourceAccount, {
        fee: '100000000',
        networkPassphrase: Networks.TESTNET
    })
    .addOperation(contract.call('verify', ...args))
    .setTimeout(300)
    .build();
    
    console.log('\nSimulating verification with 200M extra CPU instruction leeway...');
    const sim = await rpcServer.simulateTransaction(tx, { cpuInstructions: 200_000_000 });
    
    if (rpc.Api.isSimulationError(sim)) {
        console.error('Simulation error:', sim.error);
    } else if (rpc.Api.isSimulationSuccess(sim)) {
        const retval = sim.result.retval;
        const result = retval._switch.name === 'scvBool' ? retval._value : retval;
        console.log('Result:', retval._switch.name, '=', result);
        if (result === true) {
            console.log('\n✅ PROOF VERIFICATION SUCCEEDED!');
        } else {
            console.log('\n❌ Proof returned false - mathematical verification failed');
        }
        if (sim.cost) console.log('Cost:', JSON.stringify(sim.cost));
        if (sim.minResourceFee) console.log('Min resource fee:', sim.minResourceFee);
    }
}
main().catch(console.error);
