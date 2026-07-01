import { Contract, Keypair, rpc, TransactionBuilder, BASE_FEE, Address, nativeToScVal } from '@stellar/stellar-sdk';

async function main() {
  const adminSecret = "SAJMBLWDQWHJPOJDA3M2A2EKQXP4GY6MUTXBHHY6E5ELWDCK7E33MVII";
  const adminKp = Keypair.fromSecret(adminSecret);
  const eurcId = "CD6KJAOC4OQ2LQC4WQZHUFW2SMINOPC6SXUOCKN5UAX2KHVBSXUXQIDG";
  const poolId = "CBC4DNL77PU5BNTXC6APQE46FU5JDY72OOTKGHRVUTCCAT6RNLLLYDYS";

  const rpcServer = new rpc.Server('https://soroban-testnet.stellar.org');
  const account = await rpcServer.getAccount(adminKp.publicKey());

  const contract = new Contract(eurcId);
  const amountVal = nativeToScVal(BigInt("100000000000"), { type: 'i128' }); // 10,000 EURC
  
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: "Test SDF Network ; September 2015"
  })
  .addOperation(contract.call('mint', new Address(poolId).toScVal(), amountVal))
  .setTimeout(30)
  .build();

  tx.sign(adminKp);

  try {
    const sim = await rpcServer.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      console.error("Simulation failed:", sim.error);
      return;
    }
    const assembled = rpc.assembleTransaction(tx, sim).build();
    assembled.sign(adminKp);
    const result = await rpcServer.sendTransaction(assembled);
    console.log("Tx sent:", result.hash);
    
    // poll
    for(let i=0; i<10; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const st = await rpcServer.getTransaction(result.hash);
        console.log("Status:", st.status);
        if (st.status === 'SUCCESS') break;
    }
  } catch (e) {
    console.error(e);
  }
}

main().catch(console.error);
