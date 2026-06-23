import { NextRequest, NextResponse } from 'next/server';
import {
  Keypair,
  Asset,
  TransactionBuilder,
  Operation,
  BASE_FEE,
  Horizon,
} from '@stellar/stellar-sdk';

const NETWORK_PASSPHRASE = (
  process.env.NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015'
).replace(/^["']|["']$/g, '');

const HORIZON_URL =
  process.env.NEXT_PUBLIC_STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';

// Map of assetCode -> { secret, issuerAddress }
const ASSET_ISSUERS: Record<string, { secret: string; issuerAddress: string } | undefined> = {
  USDC: {
    secret: process.env.NEXT_PUBLIC_USDC_ISSUER_SECRET || '',
    issuerAddress: process.env.NEXT_PUBLIC_USDC_ISSUER_ADDRESS || '',
  },
  EURC: {
    secret: process.env.NEXT_PUBLIC_EURC_ISSUER_SECRET || '',
    issuerAddress: process.env.NEXT_PUBLIC_EURC_ISSUER_ADDRESS || '',
  },
  MGUSD: {
    secret: process.env.NEXT_PUBLIC_MGUSD_ISSUER_SECRET || '',
    issuerAddress: process.env.NEXT_PUBLIC_MGUSD_ISSUER_ADDRESS || '',
  },
  YLDS: {
    secret: process.env.NEXT_PUBLIC_YLDS_ISSUER_SECRET || '',
    issuerAddress: process.env.NEXT_PUBLIC_YLDS_ISSUER_ADDRESS || '',
  },
};

export async function POST(req: NextRequest) {
  try {
    const { recipientAddress, assetCode, amount } = await req.json();

    if (!recipientAddress || !assetCode || !amount) {
      return NextResponse.json({ error: 'Missing required fields: recipientAddress, assetCode, amount' }, { status: 400 });
    }

    const issuerInfo = ASSET_ISSUERS[assetCode.toUpperCase()];
    if (!issuerInfo || !issuerInfo.secret || !issuerInfo.issuerAddress) {
      return NextResponse.json(
        { error: `Issuer configuration not found for ${assetCode}. Make sure NEXT_PUBLIC_${assetCode.toUpperCase()}_ISSUER_SECRET and NEXT_PUBLIC_${assetCode.toUpperCase()}_ISSUER_ADDRESS are set in .env.local` },
        { status: 400 }
      );
    }

    const { secret, issuerAddress } = issuerInfo;
    const issuerKeypair = Keypair.fromSecret(secret);
    const horizon = new Horizon.Server(HORIZON_URL);

    let issuerAccount;
    try {
      issuerAccount = await horizon.loadAccount(issuerAddress);
    } catch (e) {
      return NextResponse.json({ error: 'Could not load issuer account. Is the issuer funded on testnet?' }, { status: 500 });
    }

    const asset = new Asset(assetCode.toUpperCase(), issuerAddress);

    const transaction = new TransactionBuilder(issuerAccount, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.payment({
          destination: recipientAddress,
          asset,
          amount: amount.toString(),
        })
      )
      .setTimeout(30)
      .build();

    transaction.sign(issuerKeypair);

    const response = await horizon.submitTransaction(transaction as any);

    if (!response.successful) {
      return NextResponse.json({ error: 'Transaction was not successful' }, { status: 500 });
    }

    return NextResponse.json({ txHash: response.hash });
  } catch (err: any) {
    const detail =
      err?.response?.data?.extras?.result_codes ||
      err?.message ||
      'Unknown error';
    return NextResponse.json({ error: `Faucet mint failed: ${JSON.stringify(detail)}` }, { status: 500 });
  }
}
