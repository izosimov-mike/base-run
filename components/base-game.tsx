"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { sdk } from '@farcaster/miniapp-sdk'
import { useGameContract } from "@/hooks/useGameContract"
import { backendApi } from "@/lib/backend-api"

declare global {
  var Phaser: any
}

// Optimized for mini-app viewport (424x695 on web)
const GAME_WIDTH = 400
const GAME_HEIGHT = 520

const LETTERS = ["b", "a", "s", "e"]
const DEFAULT_ROW_SIZES = [2, 3, 4, 5]

interface GameState {
  currentRow: number
  gameStatus: "idle" | "playing" | "won" | "lost"
  revealedLetters: string[]
  rowSizes: number[]
}

// Click handler type - returns result from backend
type ClickHandler = (row: number, col: number) => Promise<{ result: 'hit' | 'miss' | 'bot_detected', letter?: string }>

type GameFlowState = 
  | "initial"
  | "buy_tickets"
  | "ready_to_play"
  | "starting_attempt"
  | "playing"
  | "won"
  | "claiming"
  | "claimed"
  | "lost"

function createMainScene(Phaser: any) {
  class MainScene extends Phaser.Scene {
    private squares: Phaser.GameObjects.Rectangle[][] = []
    private gameState: GameState = {
      currentRow: 0,
      gameStatus: "idle",
      revealedLetters: [],
      rowSizes: [...DEFAULT_ROW_SIZES],
    }
    private statusText!: Phaser.GameObjects.Text
    private revealedText!: Phaser.GameObjects.Text
    private onGameStateChange?: (state: GameState) => void
    private onSquareClick?: ClickHandler
    private isProcessingClick: boolean = false

    constructor() {
      super({ key: "MainScene" })
    }

    init(data: { onGameStateChange?: (state: GameState) => void, onSquareClick?: ClickHandler }) {
      this.onGameStateChange = data.onGameStateChange
      this.onSquareClick = data.onSquareClick
    }

    create() {
      // Make Phaser background fully transparent to show CSS gradient behind
      // Don't set any background color - let the canvas be transparent      
      // Title - Gold with shadow
      const title = this.add
        .text(GAME_WIDTH / 2, 35, "Base Run", {
          fontSize: "42px",
          color: "#FFD700",
          fontFamily: "Montserrat",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
      title.setShadow(2, 2, 4, 0x000000, true)

      // Status text - Bright white with strong shadow for readability
      this.statusText = this.add
        .text(GAME_WIDTH / 2, 75, "", {
          fontSize: "18px",
          color: "#FFFFFF",
          fontFamily: "Montserrat",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setVisible(false)
      this.statusText.setShadow(3, 3, 6, 0x000000, true)

      // Revealed letters display - Gold (moved down 15px)
      this.revealedText = this.add
        .text(GAME_WIDTH / 2, 445, "", {
          fontSize: "36px",
          color: "#FFD700",
          fontFamily: "Montserrat",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
      this.revealedText.setShadow(2, 2, 4, 0x000000, true)

      // Footer text - Silver gray
      this.add
        .text(GAME_WIDTH / 2, 495, "Find your BASE way", {
          fontSize: "28px",
          color: "#C0C0C0",
          fontFamily: "Montserrat",
        })
        .setOrigin(0.5)

      this.setupGame()
    }

    preload() {}

    setupGame() {
      this.squares.forEach((row) => {
        row.forEach((sq) => {
          sq.destroy()
          const letterText = sq.getData("letterText")
          if (letterText) letterText.destroy()
        })
      })
      this.squares = []
      
      const gameAreaYStart = 80
      const gameAreaYEnd = 450
      const textsToDestroy: any[] = []
      this.children.list.forEach((child: any) => {
        if (child.type === 'Text' && 
            child !== this.statusText && 
            child !== this.revealedText &&
            child.y >= gameAreaYStart && 
            child.y <= gameAreaYEnd) {
          textsToDestroy.push(child)
        }
      })
      textsToDestroy.forEach((text) => text.destroy())

      // Letter positions are now generated on backend - not stored locally
      this.isProcessingClick = false

      this.drawSquares()
      this.notifyStateChange()
    }

    drawSquares() {
      const startY = 100
      const rowSpacing = 85
      const squareSize = 55
      const gap = 12

      for (let rowIndex = 0; rowIndex < 4; rowIndex++) {
        const rowSize = this.gameState.rowSizes[rowIndex]
        const totalWidth = rowSize * squareSize + (rowSize - 1) * gap
        const startX = (GAME_WIDTH - totalWidth) / 2
        const rowSquares: Phaser.GameObjects.Rectangle[] = []

        for (let i = 0; i < rowSize; i++) {
          const x = startX + i * (squareSize + gap) + squareSize / 2
          const y = startY + rowIndex * rowSpacing + squareSize / 2

          // Create gradient effect for squares (gold to neon green)
          const square = this.add
            .rectangle(x, y, squareSize, squareSize, 0xFFD700)
            .setStrokeStyle(2, 0x00FF7F)
            .setInteractive({ useHandCursor: true })

          square.setData("questionMark", null)
          square.setData("rowIndex", rowIndex)
          square.setData("squareIndex", i)
          square.setData("revealed", false)

          // Add shimmer/twinkle effect for casino feel
          if (this.gameState.gameStatus === "idle" || this.gameState.gameStatus === "playing") {
            this.tweens.add({
              targets: square,
              alpha: { from: 0.8, to: 1 },
              duration: Phaser.Math.Between(1000, 2000),
              yoyo: true,
              repeat: -1,
              delay: Phaser.Math.Between(0, 500)
            })
          }

          square.on("pointerover", () => {
            if (
              this.gameState.gameStatus === "playing" &&
              rowIndex === this.gameState.currentRow &&
              !square.getData("revealed")
            ) {
              square.setFillStyle(0x00FF7F)
              square.setScale(1.05)
              // Add glow effect
              square.setStrokeStyle(3, 0x00FF7F)
            }
          })

          square.on("pointerout", () => {
            if (
              !square.getData("revealed") &&
              this.gameState.gameStatus !== "lost"
            ) {
              square.setFillStyle(0xFFD700)
              square.setScale(1)
              square.setStrokeStyle(2, 0x00FF7F)
            }
          })

          square.on("pointerdown", () => {
            this.handleSquareClick(rowIndex, i, square)
          })

          rowSquares.push(square)
        }
        this.squares.push(rowSquares)
      }

      this.highlightCurrentRow()
    }

    highlightCurrentRow() {
      for (let rowIndex = 0; rowIndex < this.squares.length; rowIndex++) {
        for (const square of this.squares[rowIndex]) {
          if (!square.getData("revealed")) {
            if (
              rowIndex === this.gameState.currentRow &&
              this.gameState.gameStatus === "playing"
            ) {
              square.setStrokeStyle(3, 0x00BFFF)
              // Add pulsing glow effect
              this.tweens.add({
                targets: square,
                alpha: { from: 0.8, to: 1 },
                duration: 500,
                yoyo: true,
                repeat: -1
              })
            } else {
              square.setStrokeStyle(2, 0x00FF7F)
            }
          }
        }
      }
    }

    async handleSquareClick(
      rowIndex: number,
      squareIndex: number,
      square: Phaser.GameObjects.Rectangle
    ) {
      if (this.gameState.gameStatus !== "playing") return
      if (rowIndex !== this.gameState.currentRow) return
      if (square.getData("revealed")) return
      if (this.isProcessingClick) return // Prevent double-clicks while waiting for backend

      // Mark as processing
      this.isProcessingClick = true
      square.setData("revealed", true)

      const questionMark = square.getData("questionMark") as Phaser.GameObjects.Text
      if (questionMark) questionMark.destroy()

      // Show loading indicator
      square.setFillStyle(0x888888)

      // Call backend to check hit/miss
      if (!this.onSquareClick) {
        console.error('No click handler set')
        this.isProcessingClick = false
        return
      }

      try {
        const result = await this.onSquareClick(rowIndex, squareIndex)
        
        if (result.result === 'miss' || result.result === 'bot_detected') {
          // Wrong square - game over
          square.setFillStyle(0xFC401F)
          this.add
            .text(square.x, square.y, "💀", {
              fontSize: "32px",
              fontFamily: "Montserrat",
            })
            .setOrigin(0.5)

          this.gameState.gameStatus = "lost"
          this.statusText.setText(result.result === 'bot_detected' ? "🤖 BOT DETECTED!" : "💀 GAME OVER!")
          this.statusText.setColor("#FC401F")
          this.statusText.setVisible(true)

          this.revealAllSquares()
        } else if (result.result === 'hit' && result.letter) {
          // Correct click - show letter
          square.setFillStyle(0xFFD700)
          square.setStrokeStyle(2, 0x00FF7F)
          const letterText = this.add
            .text(square.x, square.y, result.letter.toUpperCase(), {
              fontSize: "24px",
              color: "#0000FF",
              fontFamily: "Montserrat",
              fontStyle: "bold",
            })
            .setOrigin(0.5)
          letterText.setShadow(1, 1, 2, 0x000000, true)
          square.setData("letterText", letterText)

          this.gameState.revealedLetters.push(result.letter)
          this.revealedText.setText(this.gameState.revealedLetters.join("").toUpperCase())

          if (this.gameState.currentRow === 3) {
            this.gameState.gameStatus = "won"
            this.statusText.setText("🎉 YOU WIN!")
            this.statusText.setColor("#66C800")
            this.statusText.setVisible(true)

            this.createCelebration()
          } else {
            this.gameState.currentRow++
            this.statusText.setText(`Find "${LETTERS[this.gameState.currentRow].toUpperCase()}"`)
            this.statusText.setColor("#C0C0C0")
            this.statusText.setVisible(true)
            this.highlightCurrentRow()
          }
        }
      } catch (error) {
        console.error('Click error:', error)
        // Revert the square state on error
        square.setFillStyle(0xFFD700)
        square.setData("revealed", false)
      } finally {
        this.isProcessingClick = false
      }

      this.notifyStateChange()
    }

    revealAllSquares() {
      // After game over, just fade out unrevealed squares
      // We don't reveal actual positions since they're server-side only
      for (let rowIndex = 0; rowIndex < this.squares.length; rowIndex++) {
        for (let i = 0; i < this.squares[rowIndex].length; i++) {
          const square = this.squares[rowIndex][i]
          
          if (!square.getData("revealed")) {
            const questionMark = square.getData("questionMark") as Phaser.GameObjects.Text
            if (questionMark) questionMark.destroy()

            // Fade out unrevealed squares
            square.setFillStyle(0x666666)
            square.setAlpha(0.5)
          }
        }
      }
    }

    createCelebration() {
      for (let i = 0; i < 30; i++) {
        const x = Phaser.Math.Between(0, GAME_WIDTH)
        const y = Phaser.Math.Between(0, GAME_HEIGHT)
        const colors = [0x66C800, 0xFFD12F, 0x0000FF, 0x3C8AFF, 0xFEA8CD]
        const particle = this.add
          .circle(x, -20, Phaser.Math.Between(3, 10), Phaser.Math.RND.pick(colors))
          .setAlpha(0.8)

        this.tweens.add({
          targets: particle,
          y: y,
          alpha: 0,
          duration: Phaser.Math.Between(800, 1500),
          delay: Phaser.Math.Between(0, 400),
          ease: "Quad.easeOut",
        })
      }
    }

    startGame() {
      this.gameState.currentRow = 0
      this.gameState.gameStatus = "playing"
      this.gameState.revealedLetters = []
      this.revealedText.setText("")

      this.statusText.setText('Find "B"')
      this.statusText.setColor("#C0C0C0")
      this.statusText.setVisible(true)

      this.highlightCurrentRow()
      this.notifyStateChange()
    }

    resetGame() {
      this.gameState.currentRow = 0
      this.gameState.gameStatus = "idle"
      this.gameState.revealedLetters = []

      this.setupGame()
      
      this.statusText.setVisible(false)
      this.statusText.setText("")
      this.revealedText.setText("")
      
      this.highlightCurrentRow()
      this.notifyStateChange()
    }

    notifyStateChange() {
      if (this.onGameStateChange) {
        this.onGameStateChange({ ...this.gameState })
      }
    }
  }

  return MainScene
}

export function BaseGame() {
  const gameRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const isInitializingRef = useRef(false)
  const currentTicketIdRef = useRef<string | null>(null)
  const [gameState, setGameState] = useState<GameState>({
    currentRow: 0,
    gameStatus: "idle",
    revealedLetters: [],
    rowSizes: [...DEFAULT_ROW_SIZES],
  })
  const [phaserLoaded, setPhaserLoaded] = useState(false)
  const [flowState, setFlowState] = useState<GameFlowState>("initial")
  const [showTicketModal, setShowTicketModal] = useState(false)
  const [localTicketCount, setLocalTicketCount] = useState(0)
  const [backendError, setBackendError] = useState<string | null>(null)

  // Game contract hook
  const {
    isConnected,
    isWalletReady,
    isConnecting,
    address,
    prizePool,
    ticketCount,
    currentTicket,
    claimData,
    isProcessing,
    isConfirmed,
    error,
    buyTickets,
    startAttempt,
    requestWinSignature,
    claimPrize,
    resetGame: resetContractGame,
    refetchPrizePool,
    refetchAttemptBalance,
    txHash,
  } = useGameContract()

  // Sync local ticket count
  useEffect(() => {
    setLocalTicketCount(ticketCount)
  }, [ticketCount])

  // Update flow state based on ticket count
  useEffect(() => {
    if (localTicketCount > 0 && flowState === "initial") {
      setFlowState("ready_to_play")
    }
  }, [localTicketCount, flowState])

  // Handle game state changes (won/lost)
  useEffect(() => {
    const handleGameEnd = async () => {
      if (gameState.gameStatus === "won" && currentTicket && flowState === "playing") {
        setFlowState("won")
        // Call backend to get win signature
        try {
          setBackendError(null)
          const ticketId = currentTicketIdRef.current
          if (!ticketId) {
            throw new Error('No ticket ID for finish')
          }
          const finishResult = await backendApi.finish(ticketId)
          if (finishResult.success && finishResult.nonce && finishResult.expiresAt && finishResult.signature) {
            requestWinSignature(currentTicket.ticketId, currentTicket.prizeSnapshot, {
              nonce: finishResult.nonce,
              expiresAt: finishResult.expiresAt,
              signature: finishResult.signature
            })
          } else {
            setBackendError('Failed to get win signature from backend')
          }
        } catch (err: any) {
          console.error('Finish error:', err)
          setBackendError(err.message || 'Failed to verify win')
        }
      } else if (gameState.gameStatus === "lost" && flowState === "playing") {
        setFlowState("lost")
      }
    }
    handleGameEnd()
  }, [gameState.gameStatus, currentTicket, flowState, requestWinSignature])

  // Handle transaction confirmations
  useEffect(() => {
    const handleConfirmation = async () => {
      if (isConfirmed && txHash) {
        if (flowState === "buy_tickets") {
          setShowTicketModal(false)
          setFlowState("ready_to_play")
          // Immediately update local count optimistically
          await refetchAttemptBalance()
        } else if (flowState === "starting_attempt" && currentTicket && address) {
          // Store ticket ID for backend calls
          const ticketIdStr = currentTicket.ticketId.toString()
          currentTicketIdRef.current = ticketIdStr
          
          // Start game session on backend
          try {
            setBackendError(null)
            await backendApi.startGame(
              ticketIdStr,
              address,
              currentTicket.prizeSnapshot.toString()
            )
            
            setFlowState("playing")
            // Decrement local ticket count immediately
            setLocalTicketCount(prev => Math.max(0, prev - 1))
            const scene = gameRef.current?.scene.getScene("MainScene") as any
            scene?.startGame()
          } catch (err: any) {
            console.error('Backend start error:', err)
            setBackendError(err.message || 'Failed to start game on backend')
            setFlowState("ready_to_play")
          }
        } else if (flowState === "claiming") {
          setFlowState("claimed")
          // Refetch prize pool immediately after claim
          await refetchPrizePool()
        }
      }
    }
    handleConfirmation()
  }, [isConfirmed, txHash, flowState, currentTicket, address, refetchAttemptBalance, refetchPrizePool])

  // Initialize Phaser
  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return
    if (isInitializingRef.current || gameRef.current) return
    
    isInitializingRef.current = true

    const loadFont = async () => {
      try {
        if (document.fonts.check('400 16px Montserrat')) return
        
        const font = new FontFace('Montserrat', 'url(/fonts/Montserrat-Regular.ttf)', {
          weight: '400',
          style: 'normal',
        })
        await font.load()
        document.fonts.add(font)
        await document.fonts.ready
      } catch (error) {
        console.warn('Failed to load Montserrat font:', error)
      }
    }

    const checkPhaser = async () => {
      if (typeof Phaser !== "undefined" && containerRef.current && !gameRef.current) {
        await loadFont()
        
        if (!document.fonts.check('400 16px Montserrat')) {
          await new Promise(resolve => setTimeout(resolve, 200))
          await loadFont()
        }
        
        const MainScene = createMainScene(Phaser)

        const config: any = {
          type: Phaser.AUTO,
          width: GAME_WIDTH,
          height: GAME_HEIGHT,
          parent: containerRef.current,
          transparent: true,
          scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
          },
          render: {
            pixelArt: false,
            roundPixels: false,
            antialias: true,
          },
          scene: MainScene,
        }

        gameRef.current = new Phaser.Game(config)
        // Pass both game state change handler and click handler
        gameRef.current.scene.start("MainScene", { 
          onGameStateChange: setGameState,
          onSquareClick: async (row: number, col: number) => {
            const ticketId = currentTicketIdRef.current
            if (!ticketId) {
              throw new Error('No ticket ID')
            }
            const response = await backendApi.click(ticketId, row, col)
            return {
              result: response.result,
              letter: response.letter
            }
          }
        })
        setPhaserLoaded(true)
        isInitializingRef.current = false
      } else if (typeof Phaser === "undefined") {
        setTimeout(checkPhaser, 100)
      } else {
        isInitializingRef.current = false
      }
    }

    checkPhaser()

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true)
        gameRef.current = null
      }
      isInitializingRef.current = false
    }
  }, [])

  // Create sparkles effect
  const createSparkles = useCallback((x: number, y: number) => {
    const sparkleContainer = document.createElement('div')
    sparkleContainer.style.position = 'fixed'
    sparkleContainer.style.left = `${x}px`
    sparkleContainer.style.top = `${y}px`
    sparkleContainer.style.pointerEvents = 'none'
    sparkleContainer.style.zIndex = '1000'
    
    for (let i = 0; i < 8; i++) {
      const sparkle = document.createElement('div')
      sparkle.style.position = 'absolute'
      sparkle.style.width = '4px'
      sparkle.style.height = '4px'
      sparkle.style.backgroundColor = '#FFD700'
      sparkle.style.borderRadius = '50%'
      sparkle.style.boxShadow = '0 0 6px #FFD700'
      
      const angle = (Math.PI * 2 * i) / 8
      const distance = 30
      const startX = Math.cos(angle) * distance
      const startY = Math.sin(angle) * distance
      
      sparkle.style.left = '0px'
      sparkle.style.top = '0px'
      sparkleContainer.appendChild(sparkle)
      
      sparkle.animate([
        { transform: `translate(0, 0) scale(1)`, opacity: 1 },
        { transform: `translate(${startX}px, ${startY}px) scale(0)`, opacity: 0 }
      ], {
        duration: 500,
        easing: 'ease-out'
      }).onfinish = () => sparkle.remove()
    }
    
    document.body.appendChild(sparkleContainer)
    setTimeout(() => sparkleContainer.remove(), 600)
  }, [])

  // Share game via Farcaster composeCast
  const handleShare = useCallback(async (e: React.MouseEvent) => {
    createSparkles(e.clientX, e.clientY)
    try {
      await sdk.actions.composeCast({
        text: "Ready to test your instinct? Build your Base way. Beat the challenge.",
        embeds: [
          "https://base-run.vercel.app",
          "https://base-run.vercel.app/promo.png"
        ]
      })
    } catch (error) {
      console.error('Failed to share:', error)
    }
  }, [createSparkles])

  // Check if game ended (for blinking Share button)
  const isGameEnded = flowState === "won" || flowState === "lost" || flowState === "claimed" || flowState === "claiming"

  const handlePlayClick = useCallback(() => {
    if (!phaserLoaded || !isWalletReady) return
    
    if (flowState === "initial" || flowState === "lost" || flowState === "claimed") {
      if (localTicketCount > 0) {
        setFlowState("ready_to_play")
      } else {
        setShowTicketModal(true)
        setFlowState("buy_tickets")
      }
    } else if (flowState === "ready_to_play") {
      setFlowState("starting_attempt")
      startAttempt()
    }
  }, [phaserLoaded, isWalletReady, flowState, localTicketCount, startAttempt])

  const handleBuyTickets = useCallback(async (amount: 1 | 10 | 50) => {
    const success = await buyTickets(amount)
    if (success) {
      // Optimistically update local count
      setLocalTicketCount(prev => prev + amount)
    }
  }, [buyTickets])

  const handleClaimPrize = useCallback(async () => {
    if (!claimData) return
    setFlowState("claiming")
    await claimPrize()
  }, [claimData, claimPrize])

  const handleNewGame = useCallback(async () => {
    const scene = gameRef.current?.scene.getScene("MainScene") as any
    scene?.resetGame()
    resetContractGame()
    
    // Clear backend state
    currentTicketIdRef.current = null
    setBackendError(null)
    
    // Refetch actual ticket count and prize pool from contract
    const [ticketResult] = await Promise.all([
      refetchAttemptBalance(),
      refetchPrizePool()
    ])
    const actualTicketCount = ticketResult.data ? Number(ticketResult.data) : 0
    
    if (actualTicketCount > 0) {
      setLocalTicketCount(actualTicketCount)
      setFlowState("ready_to_play")
    } else {
      setLocalTicketCount(0)
      setFlowState("initial")
    }
  }, [resetContractGame, refetchAttemptBalance, refetchPrizePool])

  const getButtonText = () => {
    switch (flowState) {
      case "initial":
        return localTicketCount > 0 ? "Play" : "Buy Tickets"
      case "buy_tickets":
        return "Buying..."
      case "ready_to_play":
        return "Play"
      case "starting_attempt":
        return "Starting..."
      case "playing":
        return "Playing..."
      case "won":
        return claimData ? "Claim" : "Loading..."
      case "claiming":
        return "Claiming..."
      case "claimed":
        return "New Game"
      case "lost":
        return "Try Again"
      default:
        return "Play"
    }
  }

  const isButtonDisabled = () => {
    if (!phaserLoaded) return true
    if (isProcessing) return true
    if (flowState === "playing") return true
    if (flowState === "won" && !claimData) return true
    return false
  }

  const handleMainButtonClick = (e: React.MouseEvent) => {
    createSparkles(e.clientX, e.clientY)
    switch (flowState) {
      case "initial":
        if (localTicketCount > 0) {
          setFlowState("ready_to_play")
        } else {
          setShowTicketModal(true)
          setFlowState("buy_tickets")
        }
        break
      case "ready_to_play":
        handlePlayClick()
        break
      case "won":
        if (claimData) handleClaimPrize()
        break
      case "claimed":
      case "lost":
        handleNewGame()
        break
    }
  }

  return (
    <div 
      ref={wrapperRef}
      className="flex flex-col w-full h-full min-h-screen"
      style={{ 
        background: 'linear-gradient(to bottom, #121212, #0D47A1)', 
        fontFamily: 'Montserrat, sans-serif' 
      }}
    >
      {/* Header with Prize Pool and Tickets */}
      <div className="flex justify-between items-center px-3 py-2 flex-shrink-0">
        {/* Prize Pool - Gold badge with pulsing */}
        <div 
          className="rounded-lg px-4 py-2 shadow-lg border-2 border-yellow-400 animate-pulse"
          style={{ 
            background: 'linear-gradient(135deg, #FFD700, #FFA500)',
            boxShadow: '0 0 20px rgba(255, 215, 0, 0.6), 0 0 40px rgba(255, 215, 0, 0.4)'
          }}
        >
          <div className="text-[16px] text-black uppercase tracking-wide font-bold">Prize Pool</div>
          <div className="text-[22px] font-bold text-black">
            {parseFloat(prizePool).toFixed(5)} ETH
          </div>
        </div>

        {/* Tickets - Red badge */}
        <div 
          className="rounded-lg px-4 py-2 shadow-lg border-2 border-red-500"
          style={{ 
            background: 'linear-gradient(135deg, #FF4136, #C62828)'
          }}
        >
          <div className="text-[16px] text-white uppercase tracking-wide font-bold">Tickets</div>
          <div className="text-[22px] font-bold text-white">
            {localTicketCount}
          </div>
        </div>
      </div>

      {/* Game Container - flexible area (transparent, parent gradient shows through) */}
      <div 
        ref={containerRef}
        className="flex-grow flex items-center justify-center"
        style={{ minHeight: '400px' }}
      />

      {/* Control Buttons */}
      <div className="flex gap-4 justify-center px-3 py-3 flex-shrink-0">
        <button
          onClick={handleShare}
          disabled={!phaserLoaded}
          className={`py-4 text-[18px] font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:scale-105 ${isGameEnded ? 'animate-pulse' : ''}`}
          style={{ 
            width: '160px',
            background: isGameEnded 
              ? 'linear-gradient(135deg, #FFD700, #FFA500)' 
              : 'linear-gradient(135deg, #00BFFF, #0099CC)',
            color: isGameEnded ? '#000000' : '#FFFFFF',
            boxShadow: isGameEnded
              ? '0 0 20px rgba(255, 215, 0, 0.8), 0 0 40px rgba(255, 165, 0, 0.6), 0 0 60px rgba(255, 215, 0, 0.4)'
              : '0 0 20px rgba(0, 191, 255, 0.6), 0 0 40px rgba(0, 191, 255, 0.4)',
            textShadow: isGameEnded 
              ? '0 0 5px rgba(255, 255, 255, 0.5)' 
              : '0 0 10px rgba(255, 255, 255, 0.8)'
          }}
        >
          Share
        </button>
        
        <button
          onClick={handleMainButtonClick}
          disabled={isButtonDisabled()}
          className="py-4 text-[18px] font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:scale-105"
          style={{ 
            width: '160px',
            background: flowState === "won" && claimData 
              ? 'linear-gradient(135deg, #66C800, #4CAF50)' 
              : 'linear-gradient(135deg, #FF4136, #C62828)',
            color: '#FFFFFF',
            boxShadow: flowState === "won" && claimData
              ? '0 0 20px rgba(102, 200, 0, 0.6), 0 0 40px rgba(102, 200, 0, 0.4)'
              : '0 0 20px rgba(255, 65, 54, 0.6), 0 0 40px rgba(255, 65, 54, 0.4)',
            textShadow: '0 0 10px rgba(255, 255, 255, 0.8)'
          }}
        >
          {getButtonText()}
        </button>
      </div>

      {/* Error Display - Casino Style */}
      {(error || backendError) && (
        <div 
          className="mx-3 mb-2 px-3 py-2 rounded-lg text-sm text-center border border-red-500"
          style={{ 
            background: 'linear-gradient(135deg, #C62828, #8B0000)',
            color: '#FFFFFF',
            fontFamily: 'Montserrat, sans-serif',
            boxShadow: '0 0 15px rgba(198, 40, 40, 0.5)'
          }}
        >
          {error || backendError}
        </div>
      )}

      {/* Ticket Purchase Modal - Casino Style */}
      {showTicketModal && (
        <div 
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setShowTicketModal(false)
            if (flowState === "buy_tickets") setFlowState("initial")
          }}
        >
          <div 
            className="rounded-2xl p-5 shadow-2xl w-full max-w-sm border-2 border-yellow-500"
            style={{ 
              background: 'linear-gradient(135deg, #1A1A1A, #0D47A1)',
              fontFamily: 'Montserrat, sans-serif',
              boxShadow: '0 0 30px rgba(255, 215, 0, 0.3)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 
              className="text-2xl font-bold text-center mb-5"
              style={{ 
                color: '#FFD700',
                textShadow: '0 0 10px rgba(255, 215, 0, 0.5)'
              }}
            >
              Buy Tickets
            </h2>
            
            <div className="space-y-3">
              <button
                onClick={() => handleBuyTickets(1)}
                disabled={isProcessing}
                className="w-full py-3 px-4 font-bold rounded-xl transition-all flex justify-between items-center hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                style={{ 
                  background: 'linear-gradient(135deg, #FF4136, #C62828)',
                  color: '#FFFFFF',
                  boxShadow: '0 0 15px rgba(255, 65, 54, 0.5)',
                  fontFamily: 'Montserrat, sans-serif'
                }}
              >
                <span>1 Ticket</span>
                <span style={{ color: '#FFD700' }}>0.00005 ETH</span>
              </button>
              
              <button
                onClick={() => handleBuyTickets(10)}
                disabled={isProcessing}
                className="w-full py-3 px-4 font-bold rounded-xl transition-all flex justify-between items-center hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                style={{ 
                  background: 'linear-gradient(135deg, #FF4136, #C62828)',
                  color: '#FFFFFF',
                  boxShadow: '0 0 15px rgba(255, 65, 54, 0.5)',
                  fontFamily: 'Montserrat, sans-serif'
                }}
              >
                <span>10 Tickets</span>
                <span style={{ color: '#FFD700' }}>0.0005 ETH</span>
              </button>
              
              <button
                onClick={() => handleBuyTickets(50)}
                disabled={isProcessing}
                className="w-full py-3 px-4 font-bold rounded-xl transition-all flex justify-between items-center hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                style={{ 
                  background: 'linear-gradient(135deg, #FF4136, #C62828)',
                  color: '#FFFFFF',
                  boxShadow: '0 0 15px rgba(255, 65, 54, 0.5)',
                  fontFamily: 'Montserrat, sans-serif'
                }}
              >
                <span>50 Tickets</span>
                <span style={{ color: '#FFD700' }}>0.0025 ETH</span>
              </button>
            </div>

            {isProcessing && (
              <div className="mt-4 text-center" style={{ color: '#C0C0C0', fontFamily: 'Montserrat, sans-serif' }}>
                <div 
                  className="animate-spin inline-block w-5 h-5 border-2 rounded-full mr-2"
                  style={{ borderColor: '#FFD700', borderTopColor: 'transparent' }}
                ></div>
                Processing...
              </div>
            )}
            
            <button
              onClick={() => {
                setShowTicketModal(false)
                if (flowState === "buy_tickets") setFlowState("initial")
              }}
              className="mt-4 w-full py-2 font-medium rounded-xl transition-all hover:scale-105"
              style={{ 
                background: 'linear-gradient(135deg, #00BFFF, #0099CC)',
                color: '#FFFFFF',
                boxShadow: '0 0 15px rgba(0, 191, 255, 0.5)',
                fontFamily: 'Montserrat, sans-serif'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Not Connected / Connecting Warning - Casino Style */}
      {!isWalletReady && phaserLoaded && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-40 p-4">
          <div 
            className="border-2 border-yellow-500 px-6 py-4 rounded-xl shadow-lg text-center"
            style={{ 
              background: 'linear-gradient(135deg, #1A1A1A, #0D47A1)',
              boxShadow: '0 0 30px rgba(255, 215, 0, 0.3)',
              fontFamily: 'Montserrat, sans-serif'
            }}
          >
            {isConnecting ? (
              <>
                <div 
                  className="animate-spin inline-block w-8 h-8 border-4 rounded-full mb-3"
                  style={{ borderColor: '#FFD700', borderTopColor: 'transparent' }}
                ></div>
                <p className="font-bold text-lg" style={{ color: '#FFD700' }}>Connecting wallet...</p>
                <p style={{ color: '#C0C0C0' }}>Please wait</p>
              </>
            ) : (
              <>
                <p className="font-bold text-lg" style={{ color: '#FFD700' }}>⚠️ Wallet not connected</p>
                <p style={{ color: '#C0C0C0' }}>Please connect your wallet to play</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
