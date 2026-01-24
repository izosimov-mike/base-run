"use client"

import { useCallback, useState, useEffect } from 'react'
import { 
  useAccount, 
  useReadContract, 
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
  useChainId
} from 'wagmi'
import { parseEther, formatEther, decodeEventLog } from 'viem'
import { GAME_CONTRACT_ADDRESS, GAME_CONTRACT_ABI, BASE_CHAIN_ID } from '@/lib/contract'

export interface GameTicket {
  ticketId: bigint
  prizeSnapshot: bigint
}

export interface ClaimData {
  ticketId: bigint
  prizeSnapshot: bigint
  nonce: bigint
  expiresAt: bigint
  signature: `0x${string}`
}

export function useGameContract() {
  const { address, isConnected, isConnecting } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  
  // Check if wallet is fully ready (connected and not in connecting state)
  const isWalletReady = isConnected && !isConnecting && !!address
  
  const [currentTicket, setCurrentTicket] = useState<GameTicket | null>(null)
  const [claimData, setClaimData] = useState<ClaimData | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Read prize pool
  const { data: prizePool, refetch: refetchPrizePool } = useReadContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: GAME_CONTRACT_ABI,
    functionName: 'prizePool',
    chainId: BASE_CHAIN_ID,
  })

  // Read attempt balance for current user
  const { data: attemptBalance, refetch: refetchAttemptBalance } = useReadContract({
    address: GAME_CONTRACT_ADDRESS,
    abi: GAME_CONTRACT_ABI,
    functionName: 'attemptBalance',
    args: address ? [address] : undefined,
    chainId: BASE_CHAIN_ID,
    query: {
      enabled: !!address,
    },
  })

  // Write contract hook
  const { 
    writeContract, 
    data: txHash, 
    isPending: isWritePending,
    error: writeError,
    reset: resetWrite
  } = useWriteContract()

  // Wait for transaction receipt
  const { 
    isLoading: isConfirming, 
    isSuccess: isConfirmed,
    data: txReceipt
  } = useWaitForTransactionReceipt({
    hash: txHash,
  })

  // Ensure we're on Base network
  const ensureBaseNetwork = useCallback(async () => {
    if (chainId !== BASE_CHAIN_ID) {
      try {
        await switchChain({ chainId: BASE_CHAIN_ID })
        await new Promise(resolve => setTimeout(resolve, 1000))
        return true
      } catch (err) {
        setError('Please switch to Base network')
        return false
      }
    }
    return true
  }, [chainId, switchChain])

  // Buy tickets
  const buyTickets = useCallback(async (amount: 1 | 10 | 50) => {
    if (!isWalletReady) {
      setError('Wallet is connecting. Please wait...')
      return false
    }

    setIsProcessing(true)
    setError(null)

    try {
      const onBase = await ensureBaseNetwork()
      if (!onBase) {
        setIsProcessing(false)
        return false
      }

      const functionName = amount === 1 
        ? 'buyAttempt' 
        : amount === 10 
          ? 'buyAttempts10' 
          : 'buyAttempts50'
      
      const value = amount === 1 
        ? parseEther('0.00005')
        : amount === 10 
          ? parseEther('0.0005')
          : parseEther('0.0025')

      writeContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_CONTRACT_ABI,
        functionName,
        value,
        chainId: BASE_CHAIN_ID,
      })

      return true
    } catch (err: any) {
      console.error('Buy tickets error:', err)
      setError(err?.message || 'Failed to buy tickets')
      setIsProcessing(false)
      return false
    }
  }, [isWalletReady, ensureBaseNetwork, writeContract])

  // Start attempt (creates ticket)
  // Note: We don't check attemptBalance here to avoid race conditions after buying tickets
  // The contract will revert with NoAttemptsLeft if user has no tickets
  const startAttempt = useCallback(async () => {
    if (!isWalletReady) {
      setError('Wallet is connecting. Please wait...')
      return null
    }

    setIsProcessing(true)
    setError(null)

    try {
      const onBase = await ensureBaseNetwork()
      if (!onBase) {
        setIsProcessing(false)
        return null
      }

      writeContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_CONTRACT_ABI,
        functionName: 'startAttempt',
        chainId: BASE_CHAIN_ID,
      })

      return true
    } catch (err: any) {
      console.error('Start attempt error:', err)
      setError(err?.message || 'Failed to start attempt')
      setIsProcessing(false)
      return null
    }
  }, [isWalletReady, ensureBaseNetwork, writeContract])

  // Parse AttemptStarted event from transaction receipt
  useEffect(() => {
    if (isConfirmed && txReceipt) {
      // Look for AttemptStarted event
      for (const log of txReceipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: GAME_CONTRACT_ABI,
            data: log.data,
            topics: log.topics,
          })
          
          if (decoded.eventName === 'AttemptStarted') {
            const { ticketId, snapshot } = decoded.args as { 
              player: `0x${string}`
              ticketId: bigint
              snapshot: bigint 
            }
            setCurrentTicket({
              ticketId,
              prizeSnapshot: snapshot
            })
            console.log('Attempt started:', { ticketId: ticketId.toString(), prizeSnapshot: snapshot.toString() })
          }
        } catch {
          // Not this event type, continue
        }
      }

      // Refetch balances after any confirmed transaction
      refetchPrizePool()
      refetchAttemptBalance()
      setIsProcessing(false)
    }
  }, [isConfirmed, txReceipt, refetchPrizePool, refetchAttemptBalance])

  // Handle write errors
  useEffect(() => {
    if (writeError) {
      console.error('Write error:', writeError)
      setError(writeError.message || 'Transaction failed')
      setIsProcessing(false)
    }
  }, [writeError])

  // Request win signature from backend (called after backend confirms win)
  const requestWinSignature = useCallback(async (ticketId: bigint, prizeSnapshot: bigint, signatureData: { nonce: string, expiresAt: string, signature: string }) => {
    if (!address) return null

    try {
      setClaimData({
        ticketId,
        prizeSnapshot,
        nonce: BigInt(signatureData.nonce),
        expiresAt: BigInt(signatureData.expiresAt),
        signature: signatureData.signature as `0x${string}`,
      })

      return signatureData
    } catch (err: any) {
      console.error('Set claim data error:', err)
      setError(err?.message || 'Failed to set claim data')
      return null
    }
  }, [address])

  // Claim prize
  const claimPrize = useCallback(async () => {
    if (!claimData || !isWalletReady) {
      setError('No claim data available or wallet not ready')
      return false
    }

    setIsProcessing(true)
    setError(null)

    try {
      const onBase = await ensureBaseNetwork()
      if (!onBase) {
        setIsProcessing(false)
        return false
      }

      writeContract({
        address: GAME_CONTRACT_ADDRESS,
        abi: GAME_CONTRACT_ABI,
        functionName: 'claimPrize',
        args: [
          claimData.ticketId,
          claimData.prizeSnapshot,
          claimData.nonce,
          claimData.expiresAt,
          claimData.signature,
        ],
        chainId: BASE_CHAIN_ID,
      })

      return true
    } catch (err: any) {
      console.error('Claim prize error:', err)
      setError(err?.message || 'Failed to claim prize')
      setIsProcessing(false)
      return false
    }
  }, [claimData, isWalletReady, ensureBaseNetwork, writeContract])

  // Reset game state
  const resetGame = useCallback(() => {
    setCurrentTicket(null)
    setClaimData(null)
    setError(null)
    resetWrite()
  }, [resetWrite])

  // Format values for display
  const formattedPrizePool = prizePool ? formatEther(prizePool) : '0'
  const ticketCount = attemptBalance ? Number(attemptBalance) : 0

  return {
    // State
    isConnected,
    isWalletReady,
    isConnecting,
    address,
    prizePool: formattedPrizePool,
    ticketCount,
    currentTicket,
    claimData,
    isProcessing: isProcessing || isWritePending || isConfirming,
    isConfirmed,
    error,
    
    // Actions
    buyTickets,
    startAttempt,
    requestWinSignature,
    claimPrize,
    resetGame,
    refetchPrizePool,
    refetchAttemptBalance,
    
    // Transaction state
    txHash,
  }
}
