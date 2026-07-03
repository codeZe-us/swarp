import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet');

  const mockCredential = {
    user_address_hash: "123",
    credential_type: "0",
    expiry_timestamp: "2000000000",
    issuer_id: "456",
    secret: "789",
    path_elements: new Array(20).fill("0"),
    path_indices: new Array(20).fill(0),
    credentials_root: "17801143850686959559853709842367815603406348626228311236543808542576188238307", 
    current_timestamp: "1000000000",
    required_credential_type: "0",
    required_issuer: "456",
    user_address_public: "123",
  };

  return NextResponse.json(mockCredential);
}
