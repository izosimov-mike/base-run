import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, getAddress } from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { GAME_CONTRACT_ADDRESS, GAME_CONTRACT_ABI } from '@/lib/contract'

// EIP-712 domain and types for the Game contract
const domain = {
  name: 'GameJackpot',
  version: '1',
  chainId: 8453, // Base
  verifyingContract: GAME_CONTRACT_ADDRESS,
} as const

const types = {
  Win: [
    { name: 'player', type: 'address' },
    { name: 'ticketId', type: 'uint256' },
    { name: 'prizeSnapshot', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiresAt', type: 'uint256' },
  ],
} as const

// Create public client for reading contract state
const publicClient = createPublicClient({
  chain: base,
  transport: http(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { player, ticketId, prizeSnapshot } = body

    // Validate input
    if (!player || !ticketId || !prizeSnapshot) {
      return NextResponse.json(
        { error: 'Missing required fields: player, ticketId, prizeSnapshot' },
        { status: 400 }
      )
    }

    // Get signer private key from environment
    const signerPrivateKey = process.env.SIGNER_PRIVATE_KEY
    if (!signerPrivateKey) {
      console.error('SIGNER_PRIVATE_KEY not configured')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    // Create account from private key
    const account = privateKeyToAccount(signerPrivateKey as `0x${string}`)

    // Verify the ticket exists and belongs to the player
    const ticketData = await publicClient.readContract({
      address: GAME_CONTRACT_ADDRESS,
      abi: GAME_CONTRACT_ABI,
      functionName: 'tickets',
      args: [BigInt(ticketId)],
    })

    const [ticketPlayer, ticketPrizeSnapshot, claimed] = ticketData as [string, bigint, boolean]

    // Validate ticket ownership
    if (getAddress(ticketPlayer) !== getAddress(player)) {
      return NextResponse.json(
        { error: 'Ticket does not belong to this player' },
        { status: 403 }
      )
    }

    // Check if already claimed
    if (claimed) {
      return NextResponse.json(
        { error: 'Prize already claimed' },
        { status: 400 }
      )
    }

    // Validate prize snapshot matches
    if (ticketPrizeSnapshot.toString() !== prizeSnapshot) {
      return NextResponse.json(
        { error: 'Prize snapshot mismatch' },
        { status: 400 }
      )
    }

    // Verify current prize pool has enough funds
    const currentPrizePool = await publicClient.readContract({
      address: GAME_CONTRACT_ADDRESS,
      abi: GAME_CONTRACT_ABI,
      functionName: 'prizePool',
    }) as bigint

    if (currentPrizePool < BigInt(prizeSnapshot)) {
      return NextResponse.json(
        { error: 'Insufficient prize pool' },
        { status: 400 }
      )
    }

    // Generate unique nonce (timestamp + random)
    const nonce = BigInt(Date.now()) * 1000000n + BigInt(Math.floor(Math.random() * 1000000))
    
    // Signature expires in 10 minutes
    const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 600)

    // Create the message to sign
    const message = {
      player: getAddress(player),
      ticketId: BigInt(ticketId),
      prizeSnapshot: BigInt(prizeSnapshot),
      nonce,
      expiresAt,
    }

    // Sign the typed data using EIP-712
    const signature = await account.signTypedData({
      domain,
      types,
      primaryType: 'Win',
      message,
    })

    console.log('Win signature created for player:', player, 'ticketId:', ticketId)

    return NextResponse.json({
      success: true,
      nonce: nonce.toString(),
      expiresAt: expiresAt.toString(),
      signature,
    })

  } catch (error: any) {
    console.error('Sign win error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to sign win' },
      { status: 500 }
    )
  }
}
