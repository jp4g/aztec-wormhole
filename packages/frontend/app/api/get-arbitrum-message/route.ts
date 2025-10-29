// app/api/get-arbitrum-message/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { fetchArbitrumMessage, normalizeHash } from '../../lib/arbitrum/getMessage';

interface MessageRequestBody {
  txHash?: string;
}

interface RouteConfig {
  providerUrl: string;
  contractAddress: string;
}

function readConfig(): RouteConfig {
  const providerUrl = process.env.NEXT_PUBLIC_RPC_URL ?? 'http://localhost:8545';
  const contractAddress =
    process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? '0x009cbB8f91d392856Cb880d67c806Aa731E3d686';

  return { providerUrl, contractAddress };
}

async function parseRequest(request: NextRequest): Promise<MessageRequestBody> {
  try {
    const body = (await request.json()) as MessageRequestBody;
    return body ?? {};
  } catch {
    return {};
  }
}

function ensureTxHash(body: MessageRequestBody) {
  if (!body.txHash) {
    throw new Error('Transaction hash is required');
  }
  return body.txHash;
}

function buildSuccessResponse(txHash: string, result: Awaited<ReturnType<typeof fetchArbitrumMessage>>) {
  return NextResponse.json({
    success: true,
    txHash,
    message: result.rawResult,
    rawResult: result.rawResult,
    parsedData: result.decodedAmount
      ? {
          txHash,
          amount: result.decodedAmount,
          rawData: [result.decodedAmount],
        }
      : undefined,
    note: result.decodedAmount ? undefined : 'No amount found for this transaction hash',
  });
}

function buildErrorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return NextResponse.json(
    {
      success: false,
      error: message,
    },
    { status },
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await parseRequest(request);
    const txHash = ensureTxHash(body);
    const config = readConfig();

    const result = await fetchArbitrumMessage(txHash, config);
    const normalizedHash = normalizeHash(txHash);
    return buildSuccessResponse(normalizedHash, result);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'Transaction hash is required' || error.message === 'Invalid transaction hash format')
    ) {
      return buildErrorResponse(error, 400);
    }

    console.error('Error getting message by txID:', error);
    return buildErrorResponse(error);
  }
}
