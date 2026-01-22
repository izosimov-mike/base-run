// Game Contract Configuration
export const GAME_CONTRACT_ADDRESS = '0xe06B3465688C57Ef05cC01A724fE3c5Af33aC9b7' as const

export const GAME_CONTRACT_ABI = [
  // Read functions
  {
    inputs: [],
    name: 'prizePool',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: '', type: 'address' }],
    name: 'attemptBalance',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'tickets',
    outputs: [
      { internalType: 'address', name: 'player', type: 'address' },
      { internalType: 'uint256', name: 'prizeSnapshot', type: 'uint256' },
      { internalType: 'bool', name: 'claimed', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'ENTRY_FEE',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'signer',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Write functions
  {
    inputs: [],
    name: 'buyAttempt',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'buyAttempts10',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'buyAttempts50',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'startAttempt',
    outputs: [{ internalType: 'uint256', name: 'ticketId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'ticketId', type: 'uint256' },
      { internalType: 'uint256', name: 'prizeSnapshot', type: 'uint256' },
      { internalType: 'uint256', name: 'nonce', type: 'uint256' },
      { internalType: 'uint256', name: 'expiresAt', type: 'uint256' },
      { internalType: 'bytes', name: 'signature', type: 'bytes' },
    ],
    name: 'claimPrize',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'player', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'count', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'value', type: 'uint256' },
    ],
    name: 'AttemptsPurchased',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'player', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'ticketId', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'snapshot', type: 'uint256' },
    ],
    name: 'AttemptStarted',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'address', name: 'player', type: 'address' },
      { indexed: false, internalType: 'uint256', name: 'ticketId', type: 'uint256' },
      { indexed: false, internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'PrizeWon',
    type: 'event',
  },
] as const

// Ticket prices
export const TICKET_PRICES = {
  single: '0.00005',    // 1 ticket
  ten: '0.0005',        // 10 tickets  
  fifty: '0.0025',      // 50 tickets
} as const

// Function selectors
export const FUNCTION_SELECTORS = {
  buyAttempt: '0xe9e9a3ef',
  buyAttempts10: '0x9381011a', 
  buyAttempts50: '0xb805084f',
  startAttempt: '0x6dbfa858',
} as const

// Base chain ID
export const BASE_CHAIN_ID = 8453
