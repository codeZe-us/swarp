const { execSync } = require('child_process');

const RATES = {
  USDC: { id: 0, priceInUsd: 1.00 },
  EURC: { id: 1, priceInUsd: 1.08 },
  MGUSD: { id: 2, priceInUsd: 1.00 },
  YLDS: { id: 3, priceInUsd: 1.00 },
  XLM: { id: 4, priceInUsd: 0.10 },
};

const POOL_ID = 'CCXBQUECJBAEMCJIQHGOFZ64XJGRDNCXZF7MVXQAWIRIDRFB456O7ELM';
const ADMIN_ADDR = 'GBN3JILDFGC7GP5KTEVWDUAGBP4YHKT7HWAJIQPBWLRF4FIRUAKXH4BN';
const DENOMINATOR = 10000000;

for (const assetIn of Object.values(RATES)) {
  for (const assetOut of Object.values(RATES)) {
    if (assetIn.id === assetOut.id) continue;

    // Skip USDC to EURC as we just set it manually
    if (assetIn.id === 0 && assetOut.id === 1) continue;

    const rate = assetIn.priceInUsd / assetOut.priceInUsd;
    const numerator = Math.floor(rate * DENOMINATOR);

    console.log(`Setting rate for ${assetIn.id} -> ${assetOut.id} to ${numerator} / ${DENOMINATOR}`);
    
    const cmd = `..\\stellar.exe contract invoke --network testnet --source admin --id ${POOL_ID} -- set_rate --admin ${ADMIN_ADDR} --asset_in_id ${assetIn.id} --asset_out_id ${assetOut.id} --new_rate ${numerator} --new_denominator ${DENOMINATOR}`;
    
    try {
      execSync(cmd, { stdio: 'inherit' });
      console.log('Success!');
    } catch (e) {
      console.error('Failed on', assetIn.id, '->', assetOut.id);
    }
  }
}
