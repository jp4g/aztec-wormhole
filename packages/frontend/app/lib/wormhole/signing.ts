import { MockEmitter, MockGuardians } from './mock';

const GUARDIAN_PRIVATE_KEY = 'cfb12303a19cde580bb4dd771639b0d26bc68353645571a8cff516ab2ee113a0';

export interface VaaSubmissionResult {
  success: boolean;
  details?: unknown;
}

export async function signAndSubmitVaa({
  emitterAddress,
  chainId,
  payload,
  mockSpyUrl,
  guardianPrivateKeys = [GUARDIAN_PRIVATE_KEY],
}: {
  emitterAddress: string;
  chainId: number;
  payload: Buffer;
  mockSpyUrl: string;
  guardianPrivateKeys?: string[];
}): Promise<VaaSubmissionResult> {
  const sequence = BigInt(Date.now());

  const mockEmitter = new MockEmitter(
    emitterAddress.replace(/^0x/, ''),
    chainId,
    sequence,
  );

  const published = mockEmitter.publishMessage(
    1, // nonce
    payload,
    1, // consistency level
  );

  const guardians = new MockGuardians(0, guardianPrivateKeys);
  const signedVaa = guardians.addSignatures(published, [0]);

  const response = await fetch(`${mockSpyUrl}/submit-vaa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vaaBytes: signedVaa.toString('hex'),
    }),
  });

  if (!response.ok) {
    throw new Error(`Mock-spy returned ${response.status}: ${await response.text()}`);
  }

  return {
    success: true,
    details: await response.json(),
  };
}
