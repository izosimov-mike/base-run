"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useGameContract } from "@/hooks/useGameContract"

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
  letterPositions: number[]
}

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
    private squareContents: string[][] = []
    private gameState: GameState = {
      currentRow: 0,
      gameStatus: "idle",
      revealedLetters: [],
      rowSizes: [...DEFAULT_ROW_SIZES],
      letterPositions: [],
    }
    private statusText!: Phaser.GameObjects.Text
    private revealedText!: Phaser.GameObjects.Text
    private onGameStateChange?: (state: GameState) => void

    constructor() {
      super({ key: "MainScene" })
    }

    init(data: { onGameStateChange?: (state: GameState) => void }) {
      this.onGameStateChange = data.onGameStateChange
    }

    create() {
      // Set background color for the game area
      this.cameras.main.setBackgroundColor(0xeef0f3)
      
      // Title
      this.add
        .text(GAME_WIDTH / 2, 35, "Base Run", {
          fontSize: "42px",
          color: "#0000FF",
          fontFamily: "Montserrat",
          fontStyle: "bold",
        })
        .setOrigin(0.5)

      // Status text
      this.statusText = this.add
        .text(GAME_WIDTH / 2, 75, "", {
          fontSize: "18px",
          color: "#0000FF",
          fontFamily: "Montserrat",
        })
        .setOrigin(0.5)
        .setVisible(false)

      // Revealed letters display
      this.revealedText = this.add
        .text(GAME_WIDTH / 2, 430, "", {
          fontSize: "36px",
          color: "#0000FF",
          fontFamily: "Montserrat",
          fontStyle: "bold",
        })
        .setOrigin(0.5)

      // Footer text
      this.add
        .text(GAME_WIDTH / 2, 495, "Find your BASE way", {
          fontSize: "28px",
          color: "#0a0b0d",
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
      this.squareContents = []
      
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

      this.gameState.letterPositions = this.gameState.rowSizes.map(
        (size) => Phaser.Math.Between(0, size - 1)
      )

      for (let rowIndex = 0; rowIndex < 4; rowIndex++) {
        const rowSize = this.gameState.rowSizes[rowIndex]
        const letterPos = this.gameState.letterPositions[rowIndex]
        const rowContent: string[] = []

        for (let i = 0; i < rowSize; i++) {
          if (i === letterPos) {
            rowContent.push(LETTERS[rowIndex])
          } else {
            rowContent.push("skull")
          }
        }
        this.squareContents.push(rowContent)
      }

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

          const square = this.add
            .rectangle(x, y, squareSize, squareSize, 0xb6f569)
            .setStrokeStyle(2, 0x8fc04a)
            .setInteractive({ useHandCursor: true })

          square.setData("questionMark", null)
          square.setData("rowIndex", rowIndex)
          square.setData("squareIndex", i)
          square.setData("revealed", false)

          square.on("pointerover", () => {
            if (
              this.gameState.gameStatus === "playing" &&
              rowIndex === this.gameState.currentRow &&
              !square.getData("revealed")
            ) {
              square.setFillStyle(0xc8f77a)
              square.setScale(1.05)
            }
          })

          square.on("pointerout", () => {
            if (
              !square.getData("revealed") &&
              this.gameState.gameStatus !== "lost"
            ) {
              square.setFillStyle(0xb6f569)
              square.setScale(1)
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
              square.setStrokeStyle(2, 0x0000FF)
            } else {
              square.setStrokeStyle(2, 0x8fc04a)
            }
          }
        }
      }
    }

    handleSquareClick(
      rowIndex: number,
      squareIndex: number,
      square: Phaser.GameObjects.Rectangle
    ) {
      if (this.gameState.gameStatus !== "playing") return
      if (rowIndex !== this.gameState.currentRow) return
      if (square.getData("revealed")) return

      const content = this.squareContents[rowIndex][squareIndex]
      square.setData("revealed", true)

      const questionMark = square.getData("questionMark") as Phaser.GameObjects.Text
      if (questionMark) questionMark.destroy()

      if (content === "skull") {
        square.setFillStyle(0xFC401F)
        this.add
          .text(square.x, square.y, "💀", {
            fontSize: "32px",
            fontFamily: "Arial",
          })
          .setOrigin(0.5)

        this.gameState.gameStatus = "lost"
        this.statusText.setText("💀 GAME OVER!")
        this.statusText.setColor("#FC401F")
        this.statusText.setVisible(true)

        this.revealAllSquares()
      } else {
        square.setFillStyle(0xEEF0F3)
        const letterText = this.add
          .text(square.x, square.y, content.toUpperCase(), {
            fontSize: "24px",
            color: "#0000FF",
            fontFamily: "Montserrat",
            fontStyle: "bold",
          })
          .setOrigin(0.5)
        square.setData("letterText", letterText)

        this.gameState.revealedLetters.push(content)
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
          this.statusText.setVisible(true)
          this.highlightCurrentRow()
        }
      }

      this.notifyStateChange()
    }

    revealAllSquares() {
      for (let rowIndex = 0; rowIndex < this.squares.length; rowIndex++) {
        for (let i = 0; i < this.squares[rowIndex].length; i++) {
          const square = this.squares[rowIndex][i]
          const content = this.squareContents[rowIndex][i]
          
          if (!square.getData("revealed")) {
            const questionMark = square.getData("questionMark") as Phaser.GameObjects.Text
            if (questionMark) questionMark.destroy()

            if (content === "skull") {
              square.setFillStyle(0xFC401F)
              this.add
                .text(square.x, square.y, "💀", {
                  fontSize: "32px",
                  fontFamily: "Arial",
                })
                .setOrigin(0.5)
                .setAlpha(0.5)
            } else {
              square.setFillStyle(0xEEF0F3)
              this.add
                .text(square.x, square.y, content.toUpperCase(), {
                  fontSize: "24px",
                  color: "#0000FF",
                  fontFamily: "Montserrat",
                  fontStyle: "bold",
                })
                .setOrigin(0.5)
                .setAlpha(0.5)
            }
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

    shuffle() {
      if (this.gameState.gameStatus === "playing") return

      const shuffledSizes = Phaser.Utils.Array.Shuffle([...DEFAULT_ROW_SIZES])
      this.gameState.rowSizes = shuffledSizes
      this.gameState.currentRow = 0
      this.gameState.gameStatus = "idle"
      this.gameState.revealedLetters = []

      if (this.revealedText) this.revealedText.setText("")
      if (this.statusText) {
        this.statusText.setVisible(false)
        this.statusText.setText("")
      }

      this.setupGame()
    }

    startGame() {
      this.gameState.currentRow = 0
      this.gameState.gameStatus = "playing"
      this.gameState.revealedLetters = []
      this.revealedText.setText("")

      this.statusText.setText('Find "B"')
      this.statusText.setColor("#0000FF")
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
  const [gameState, setGameState] = useState<GameState>({
    currentRow: 0,
    gameStatus: "idle",
    revealedLetters: [],
    rowSizes: [...DEFAULT_ROW_SIZES],
    letterPositions: [],
  })
  const [phaserLoaded, setPhaserLoaded] = useState(false)
  const [flowState, setFlowState] = useState<GameFlowState>("initial")
  const [showTicketModal, setShowTicketModal] = useState(false)
  const [localTicketCount, setLocalTicketCount] = useState(0)

  // Game contract hook
  const {
    isConnected,
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
    if (gameState.gameStatus === "won" && currentTicket && flowState === "playing") {
      setFlowState("won")
      requestWinSignature(currentTicket.ticketId, currentTicket.prizeSnapshot)
    } else if (gameState.gameStatus === "lost" && flowState === "playing") {
      setFlowState("lost")
    }
  }, [gameState.gameStatus, currentTicket, flowState, requestWinSignature])

  // Handle transaction confirmations
  useEffect(() => {
    if (isConfirmed && txHash) {
      if (flowState === "buy_tickets") {
        setShowTicketModal(false)
        setFlowState("ready_to_play")
        // Immediately update local count optimistically
        refetchAttemptBalance()
      } else if (flowState === "starting_attempt" && currentTicket) {
        setFlowState("playing")
        // Decrement local ticket count immediately
        setLocalTicketCount(prev => Math.max(0, prev - 1))
        const scene = gameRef.current?.scene.getScene("MainScene") as any
        scene?.startGame()
      } else if (flowState === "claiming") {
        setFlowState("claimed")
        refetchPrizePool()
      }
    }
  }, [isConfirmed, txHash, flowState, currentTicket, refetchAttemptBalance, refetchPrizePool])

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
          backgroundColor: 0xeef0f3,
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
        gameRef.current.scene.start("MainScene", { onGameStateChange: setGameState })
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

  // Handlers
  const handleShuffle = useCallback(() => {
    if (gameState.gameStatus === "playing" || !phaserLoaded) return
    const scene = gameRef.current?.scene.getScene("MainScene") as any
    scene?.shuffle()
  }, [gameState.gameStatus, phaserLoaded])

  const handlePlayClick = useCallback(() => {
    if (!phaserLoaded || !isConnected) return
    
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
  }, [phaserLoaded, isConnected, flowState, localTicketCount, startAttempt])

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

  const handleNewGame = useCallback(() => {
    const scene = gameRef.current?.scene.getScene("MainScene") as any
    scene?.resetGame()
    resetContractGame()
    
    if (localTicketCount > 0) {
      setFlowState("ready_to_play")
    } else {
      setFlowState("initial")
    }
  }, [localTicketCount, resetContractGame])

  const getButtonText = () => {
    switch (flowState) {
      case "initial":
        return localTicketCount > 0 ? "▶️ Play" : "🎟️ Buy Tickets"
      case "buy_tickets":
        return "🎟️ Buying..."
      case "ready_to_play":
        return "▶️ Play"
      case "starting_attempt":
        return "⏳ Starting..."
      case "playing":
        return "🎮 Playing..."
      case "won":
        return claimData ? "💰 Claim" : "⏳ Loading..."
      case "claiming":
        return "⏳ Claiming..."
      case "claimed":
        return "🔄 New Game"
      case "lost":
        return "🔄 Try Again"
      default:
        return "▶️ Play"
    }
  }

  const isButtonDisabled = () => {
    if (!phaserLoaded) return true
    if (isProcessing) return true
    if (flowState === "playing") return true
    if (flowState === "won" && !claimData) return true
    return false
  }

  const handleMainButtonClick = () => {
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
      style={{ backgroundColor: '#eef0f3', fontFamily: 'Montserrat, sans-serif' }}
    >
      {/* Header with Prize Pool and Tickets */}
      <div className="flex justify-between items-center px-3 py-2 flex-shrink-0">
        {/* Prize Pool */}
        <div className="bg-white/90 backdrop-blur-sm rounded-lg px-4 py-2 shadow-md">
          <div className="text-[16px] text-black uppercase tracking-wide font-semibold">Prize Pool</div>
          <div className="text-[22px] font-bold text-blue-600">
            {parseFloat(prizePool).toFixed(5)} ETH
          </div>
        </div>

        {/* Tickets */}
        <div className="bg-white/90 backdrop-blur-sm rounded-lg px-4 py-2 shadow-md">
          <div className="text-[16px] text-black uppercase tracking-wide font-semibold">Tickets</div>
          <div className="text-[22px] font-bold text-green-600">
            🎟️ {localTicketCount}
          </div>
        </div>
      </div>

      {/* Game Container - flexible area */}
      <div 
        ref={containerRef}
        className="flex-grow flex items-center justify-center"
        style={{ minHeight: '400px' }}
      />

      {/* Control Buttons */}
      <div className="flex gap-3 justify-center px-3 py-3 flex-shrink-0">
        <button
          onClick={handleShuffle}
          disabled={!phaserLoaded || gameState.gameStatus === "playing" || flowState === "playing"}
          className="px-6 py-3 text-[24px] font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
          style={{ backgroundColor: '#b6f569', color: '#0a0b0d' }}
        >
          🔀 Shuffle
        </button>
        
        <button
          onClick={handleMainButtonClick}
          disabled={isButtonDisabled()}
          className="px-8 py-3 text-[24px] font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
          style={{ 
            backgroundColor: flowState === "won" && claimData ? '#66C800' : '#b6f569', 
            color: flowState === "won" && claimData ? '#FFFFFF' : '#0a0b0d'
          }}
        >
          {getButtonText()}
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mx-3 mb-2 bg-red-500 text-white px-3 py-2 rounded-lg text-sm text-center">
          {error}
        </div>
      )}

      {/* Ticket Purchase Modal */}
      {showTicketModal && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setShowTicketModal(false)
            if (flowState === "buy_tickets") setFlowState("initial")
          }}
        >
          <div 
            className="bg-white rounded-2xl p-4 shadow-2xl w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-center mb-4 text-gray-800">
              🎟️ Buy Tickets
            </h2>
            
            <div className="space-y-3">
              <button
                onClick={() => handleBuyTickets(1)}
                disabled={isProcessing}
                className="w-full py-3 px-4 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-bold rounded-xl transition-all flex justify-between items-center"
              >
                <span>1 Ticket</span>
                <span className="text-sm opacity-80">0.00005 ETH</span>
              </button>
              
              <button
                onClick={() => handleBuyTickets(10)}
                disabled={isProcessing}
                className="w-full py-3 px-4 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-bold rounded-xl transition-all flex justify-between items-center"
              >
                <span>10 Tickets</span>
                <span className="text-sm opacity-80">0.0005 ETH</span>
              </button>
              
              <button
                onClick={() => handleBuyTickets(50)}
                disabled={isProcessing}
                className="w-full py-3 px-4 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-300 text-white font-bold rounded-xl transition-all flex justify-between items-center"
              >
                <span>50 Tickets</span>
                <span className="text-sm opacity-80">0.0025 ETH</span>
              </button>
            </div>

            {isProcessing && (
              <div className="mt-3 text-center text-gray-500 text-sm">
                <div className="animate-spin inline-block w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full mr-2"></div>
                Processing...
              </div>
            )}
            
            <button
              onClick={() => {
                setShowTicketModal(false)
                if (flowState === "buy_tickets") setFlowState("initial")
              }}
              className="mt-4 w-full py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-xl transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Not Connected Warning */}
      {!isConnected && phaserLoaded && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
          <div className="bg-yellow-100 border-2 border-yellow-400 text-yellow-800 px-4 py-3 rounded-xl shadow-lg text-center">
            <p className="font-bold">⚠️ Wallet not connected</p>
            <p className="text-sm">Please connect your wallet to play</p>
          </div>
        </div>
      )}
    </div>
  )
}
