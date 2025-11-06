export const MESSAGE_SLOT_LENGTH = 31;

export const VAULT_GETTERS_ABI = [
  {
    type: 'function',
    name: 'getArbitrumMessage',
    inputs: [
      {
        name: 'arbitrumAddress',
        type: 'bytes32',
        internalType: 'bytes32',
      },
    ],
    outputs: [
      {
        name: '',
        type: 'uint256',
        internalType: 'uint256',
      },
    ],
    stateMutability: 'view',
  },
];