const { Keypair, Horizon, TransactionBuilder, Contract, Networks } = require('@stellar/stellar-sdk');

// You can change these to any realistic testnet rates you want
// For example: 1 USDC = 1.00 USD, 1 EURC = 1.08 USD, 1 XLM = 0.10 USD
const RATES = {
  USDC: { id: 0, priceInUsd: 1.00 },
  EURC: { id: 1, priceInUsd: 1.08 },
  MGUSD: { id: 2, priceInUsd: 1.00 },
  YLDS: { id: 3, priceInUsd: 1.00 }, // Assuming 1:1 for YLDS for now
  XLM: { id: 4, priceInUsd: 0.30 },
};

async function main() {
  const POSSIBLE_SECRETS = [
    'SCLU2VGLFDOISQHYV5IMTD4RT4NOTYMO3IQRKIWGMTDXCWW4SSTOXHB6'
  ];

  let adminKp = null;
  // We'll just pick the first one and hope it's the admin, but actually we should try them
  // To avoid complexity, we'll try the first one, and if it fails, the script will catch it.
  // Actually, let's just test which one has the admin key by simulating the transaction!
  // But wait, simulation doesn't require a signature!
  adminKp = Keypair.fromSecret(POSSIBLE_SECRETS[0]);

  const horizon = new Horizon.Server(process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL);
  
  const poolId = process.env.NEXT_PUBLIC_POOL_CONTRACT_ID;
  const contract = new Contract(poolId);

  console.log(`Setting realistic exchange rates for Pool: ${poolId}`);

  const DENOMINATOR = 10000000;

  for (const assetIn of Object.values(RATES)) {
    for (const assetOut of Object.values(RATES)) {
      if (assetIn.id === assetOut.id) continue;

      const rate = assetIn.priceInUsd / assetOut.priceInUsd;
      const numerator = Math.floor(rate * DENOMINATOR);

      console.log(`Setting rate for ${assetIn.id} -> ${assetOut.id} to ${numerator} / ${DENOMINATOR}`);

      let success = false;

      for (const secret of POSSIBLE_SECRETS) {
        try {
          const adminKp = Keypair.fromSecret(secret);
          const adminAccount = await horizon.loadAccount(adminKp.publicKey());

          const tx = new TransactionBuilder(adminAccount, { 
            fee: '10000', 
            networkPassphrase: Networks.TESTNET 
          })
          .addOperation(
            contract.call(
              'set_rate',
              ...[
                adminKp.publicKey(),
                assetIn.id,
                assetOut.id,
                numerator,
                DENOMINATOR
              ].map(val => {
                if (typeof val === 'number') {
                   const { nativeToScVal } = require('@stellar/stellar-sdk');
                   return nativeToScVal(val, { type: 'u64' });
                } else {
                   const { nativeToScVal } = require('@stellar/stellar-sdk');
                   return nativeToScVal(val, { type: 'address' });
                }
              })
            )
          )
          .setTimeout(60)
          .build();

          tx.sign(adminKp);
          
          const response = await horizon.submitTransaction(tx);
          console.log(`Success with admin ${adminKp.publicKey()}! TX: ${response.hash}`);
          success = true;
          break; // Break the secrets loop on success!
        } catch (e) {
          console.error("Error submitting transaction:", e.response ? JSON.stringify(e.response.data, null, 2) : e.message);
          // If Unauthorized, it fails. We just continue to the next secret.
        }
      }

      if (!success) {
        console.error(`Failed to set rate! None of the secrets in .env.local are the admin.`);
        process.exit(1);
      }

      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log("Finished updating rates!");
}

main().catch(console.error);
