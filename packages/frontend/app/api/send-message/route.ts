// app/api/send-message/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sendDonationMessage } from '../../lib/aztec/sendDonation';

type DonationData = {
  amount: number;
}

async function readDonationPayload(request: NextRequest): Promise<DonationData> {
  const body = (await request.json()) as DonationData;
  if (typeof body.amount !== 'number' || Number.isNaN(body.amount)) {
    throw new Error('No donation amount provided');
  }
  return body;
}

function buildSuccessResponse(result: { txHash: string }) {
  return NextResponse.json({
    success: true,
    txHash: result.txHash,
    message: 'Donation sent to contract successfully',
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
    const data = await readDonationPayload(request);
    const result = await sendDonationMessage(data);
    return buildSuccessResponse(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'No donation amount provided') {
      return buildErrorResponse(error, 400);
    }

    console.error('Error handling donation request:', error);
    return buildErrorResponse(error);
  }
}

