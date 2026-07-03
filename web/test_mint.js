const { Keypair, Horizon, TransactionBuilder, Operation, Networks, Asset } = require('@stellar/stellar-sdk');

async function main() {
  const horizon = new Horizon.Server('https://horizon-testnet.stellar.org');
  const kp = Keypair.random();
  console.log('Created kp:', kp.publicKey());

  console.log('Funding with Friendbot...');
  await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`);

  console.log('Adding trustline...');
  const account = await horizon.loadAccount(kp.publicKey());
  const asset = new Asset('USDC', 'GCUSVTVSWAHQMDO2KQC5H2TC6RCB7UNRQ5YD3XCPTNSCYWIQYMPN6VVX');
  const tx = new TransactionBuilder(account, { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.changeTrust({ asset }))
    .setTimeout(30)
    .build();
  tx.sign(kp);
  await horizon.submitTransaction(tx);

  console.log('Calling API...');
  const res = await fetch('http://localhost:3000/api/faucet/mint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipientAddress: kp.publicKey(),
      assetCode: 'USDC',
      amount: '10'
    })
  });
  
  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Response:', text);
}

main().catch(console.error);
