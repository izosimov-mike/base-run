"use client"

import { useEffect, useState } from "react"
import { sdk } from '@farcaster/miniapp-sdk'
import { BaseGame } from "@/components/base-game"
import { useAccount, useConnect } from 'wagmi'

export default function Home() {
  const [isSDKLoaded, setIsSDKLoaded] = useState(false)
  const [context, setContext] = useState<any>(null)
  const { isConnected, address } = useAccount()
  const { connect, connectors } = useConnect()

  // Initialize Farcaster MiniApp SDK
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Get context first
        const ctx = await sdk.context
        setContext(ctx)
        console.log('Farcaster MiniApp context:', ctx)

        // Signal that the app is ready to be displayed
        await sdk.actions.ready()
        setIsSDKLoaded(true)
        console.log('Farcaster MiniApp SDK ready!')
      } catch (error) {
        console.error('Failed to initialize Farcaster MiniApp SDK:', error)
        // Still mark as loaded even if SDK fails (for non-Farcaster environments)
        setIsSDKLoaded(true)
      }
    }

    initializeApp()
  }, [])

  // Auto-connect wallet if available
  useEffect(() => {
    if (isSDKLoaded && !isConnected && connectors.length > 0) {
      // Attempt to connect to the Farcaster wallet
      connect({ connector: connectors[0] })
    }
  }, [isSDKLoaded, isConnected, connectors, connect])

  return (
    <main 
      className="min-h-screen flex items-center justify-center p-4 relative"
      style={{
        backgroundColor: '#5b616e'
      }}
    >
      {/* Show user info if connected */}
      {context?.user && (
        <div className="absolute top-4 left-4 flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-lg px-3 py-2">
          {context.user.pfpUrl && (
            <img 
              src={context.user.pfpUrl} 
              alt={context.user.username || 'User'}
              className="w-8 h-8 rounded-full"
            />
          )}
          <span className="text-white text-sm font-medium">
            {context.user.displayName || context.user.username || `FID: ${context.user.fid}`}
          </span>
        </div>
      )}

      {/* Show wallet address if connected */}
      {isConnected && address && (
        <div className="absolute top-4 right-4 bg-white/10 backdrop-blur-sm rounded-lg px-3 py-2">
          <span className="text-white text-xs font-mono">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
        </div>
      )}

      <BaseGame />
    </main>
  )
}
