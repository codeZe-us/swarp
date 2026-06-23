const { rpc, xdr, scValToNative, Contract, TransactionBuilder, BASE_FEE } = require('@stellar/stellar-sdk');

async function getLeaves() {
  const rpcServer = new rpc.Server('https://soroban-testnet.stellar.org');
  const contractId = 'CBKJLN3EVQYY4AY7UCVYLV7L3BCUQLOIDWCDK6SSNKOBUKGLUMRUGJBX';
  const contract = new Contract(contractId);
  const account = 'GC33U5LDVGGDMOIXT2IOPPGKEXYRUV3TYEXMPU2U2PXON3J6LUM';

  const tx = new TransactionBuilder(new rpc.Account(account, '1'), { fee: BASE_FEE, networkPassphrase: 'Test SDF Network ; September 2015' })
    .addOperation(contract.call('get_leaf_count'))
    .setTimeout(30).build();

  const sim = await rpcServer.simulateTransaction(tx);
  const count = scValToNative(sim.result.retval);
  console.log('Leaf count:', count);

  for (let i = 0; i < Number(count); i++) {
    const txLeaf = new TransactionBuilder(new rpc.Account(account, '1'), { fee: BASE_FEE, networkPassphrase: 'Test SDF Network ; September 2015' })
      .addOperation(contract.call('get_leaf', xdr.ScVal.scvU32(i)))
      .setTimeout(30).build();
    const simLeaf = await rpcServer.simulateTransaction(txLeaf);
    const leaf = scValToNative(simLeaf.result.retval);
    const hex = Buffer.from(leaf).toString('hex');
    const dec = BigInt('0x' + hex).toString();
    console.log(`Leaf ${i}: hex=${hex} dec=${dec}`);
  }
}
getLeaves().catch(console.error);
