"use client"

import { useEffect, useState } from "react"
import { sdk } from '@farcaster/miniapp-sdk'
import { BaseGame } from "@/components/base-game"
import { useAccount, useConnect } from 'wagmi'

export default function Home() {
  const [isSDKLoaded, setIsSDKLoaded] = useState(false)
  const [context, setContext] = useState<any>(null)
  const { isConnected } = useAccount()
  const { connect, connectors } = useConnect()

  // Initialize Farcaster MiniApp SDK
  useEffect(() => {
    const initializeApp = async () => {
      try {
        const ctx = await sdk.context
        setContext(ctx)
        console.log('Farcaster MiniApp context:', ctx)
        await sdk.actions.ready()
        setIsSDKLoaded(true)
        console.log('Farcaster MiniApp SDK ready!')
      } catch (error) {
        console.error('Failed to initialize Farcaster MiniApp SDK:', error)
        setIsSDKLoaded(true)
      }
    }

    initializeApp()
  }, [])

  // Auto-connect wallet if available
  useEffect(() => {
    if (isSDKLoaded && !isConnected && connectors.length > 0) {
      connect({ connector: connectors[0] })
    }
  }, [isSDKLoaded, isConnected, connectors, connect])

  return (
    <main className="w-full h-screen overflow-hidden" style={{ background: '#1d1324' }}>
      <BaseGame />
    </main>
  )
}
