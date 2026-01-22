"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useGameContract } from "@/hooks/useGameContract"

declare global {
  var Phaser: any
}

const GAME_WIDTH = 1200
const GAME_HEIGHT = 800

const LETTERS = ["b", "a", "s", "e"]
const DEFAULT_ROW_SIZES = [2, 3, 4, 5]

interface GameState {
  currentRow: number
  gameStatus: "idle" | "playing" | "won" | "lost"
  revealedLetters: string[]
  rowSizes: number[]
  letterPositions: number[]
}

// Game flow states
type GameFlowState = 
  | "initial"           // Show Play button
  | "buy_tickets"       // Show ticket purchase options
  | "ready_to_play"     // Has tickets, ready to start attempt
  | "starting_attempt"  // Signing startAttempt transaction
  | "playing"           // Game in progress
  | "won"               // Game won, need to claim
  | "claiming"          // Claiming prize
  | "claimed"           // Prize claimed successfully
  | "lost"              // Game lost

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
      this.cameras.main.clearBeforeRender = false
      
      // Title
      this.add
        .text(GAME_WIDTH / 2, 50, "Base Run", {
          fontSize: "48px",
          color: "#32353d",
          fontFamily: "Stengazeta",
        })
        .setOrigin(0.5)

      // Status text
      this.statusText = this.add
        .text(GAME_WIDTH / 2, 120, "", {
          fontSize: "24px",
          color: "#0000FF",
          fontFamily: "Stengazeta",
        })
        .setOrigin(0.5)
        .setVisible(false)

      // Revealed letters display
      this.revealedText = this.add
        .text(GAME_WIDTH / 2, 640, "", {
          fontSize: "64px",
          color: "#0000FF",
          fontFamily: "Stengazeta",
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
      
      const gameAreaYStart = 150
      const gameAreaYEnd = 670
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
      const startY = 180
      const rowSpacing = 120
      const squareSize = 80
      const gap = 20

      for (let rowIndex = 0; rowIndex < 4; rowIndex++) {
        const rowSize = this.gameState.rowSizes[rowIndex]
        const totalWidth = rowSize * squareSize + (rowSize - 1) * gap
        const startX = (GAME_WIDTH - totalWidth) / 2
        const rowSquares: Phaser.GameObjects.Rectangle[] = []

        for (let i = 0; i < rowSize; i++) {
          const x = startX + i * (squareSize + gap) + squareSize / 2
          const y = startY + rowIndex * rowSpacing + squareSize / 2

          const square = this.add
            .rectangle(x, y, squareSize, squareSize, 0x32353d)
            .setStrokeStyle(3, 0xB1B7C3)
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
              square.setFillStyle(0xB8A581)
              square.setScale(1.05)
            }
          })

          square.on("pointerout", () => {
            if (
              !square.getData("revealed") &&
              this.gameState.gameStatus !== "lost"
            ) {
              square.setFillStyle(0x32353d)
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
              square.setStrokeStyle(3, 0x0000FF)
            } else {
              square.setStrokeStyle(3, 0xB1B7C3)
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
            fontSize: "55px",
            fontFamily: "Arial",
          })
          .setOrigin(0.5)
          .setPadding(0, 0, 0, 0)

        this.gameState.gameStatus = "lost"
        this.statusText.setText("💀 GAME OVER! You hit a skull!")
        this.statusText.setColor("#FC401F")
        this.statusText.setVisible(true)

        this.revealAllSquares()
      } else {
        square.setFillStyle(0xEEF0F3)
        const letterText = this.add
          .text(square.x, square.y, content.toUpperCase(), {
            fontSize: "40px",
            color: "#0000FF",
            fontFamily: "Stengazeta",
            fontStyle: "bold",
          })
          .setOrigin(0.5)
        square.setData("letterText", letterText)

        this.gameState.revealedLetters.push(content)
        this.revealedText.setText(this.gameState.revealedLetters.join("").toUpperCase())

        if (this.gameState.currentRow === 3) {
          this.gameState.gameStatus = "won"
          this.statusText.setText("🎉 YOU WIN! You spelled BASE!")
          this.statusText.setColor("#66C800")
          this.statusText.setVisible(true)

          this.createCelebration()
        } else {
          this.gameState.currentRow++
          this.statusText.setText(`Row ${this.gameState.currentRow + 1}: Find the letter "${LETTERS[this.gameState.currentRow].toUpperCase()}"`)
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
                  fontSize: "55px",
                  fontFamily: "Arial",
                })
                .setOrigin(0.5)
                .setPadding(0, 0, 0, 0)
                .setAlpha(0.5)
            } else {
              square.setFillStyle(0xEEF0F3)
              this.add
                .text(square.x, square.y, content.toUpperCase(), {
                  fontSize: "40px",
                  color: "#0000FF",
                  fontFamily: "Stengazeta",
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
      for (let i = 0; i < 50; i++) {
        const x = Phaser.Math.Between(0, GAME_WIDTH)
        const y = Phaser.Math.Between(0, GAME_HEIGHT)
        const colors = [0x66C800, 0xFFD12F, 0x0000FF, 0x3C8AFF, 0xFEA8CD]
        const particle = this.add
          .circle(x, -20, Phaser.Math.Between(5, 15), Phaser.Math.RND.pick(colors))
          .setAlpha(0.8)

        this.tweens.add({
          targets: particle,
          y: y,
          alpha: 0,
          duration: Phaser.Math.Between(1000, 2000),
          delay: Phaser.Math.Between(0, 500),
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

      this.statusText.setText('Row 1: Find the letter "B"')
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

  // Game contract hook
  const {
    isConnected,
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
  } = useGameContract()

  // Update flow state based on ticket count
  useEffect(() => {
    if (ticketCount > 0 && flowState === "initial") {
      setFlowState("ready_to_play")
    }
  }, [ticketCount, flowState])

  // Handle game state changes (won/lost)
  useEffect(() => {
    if (gameState.gameStatus === "won" && currentTicket && flowState === "playing") {
      // Game won - request signature from backend
      setFlowState("won")
      requestWinSignature(currentTicket.ticketId, currentTicket.prizeSnapshot)
    } else if (gameState.gameStatus === "lost" && flowState === "playing") {
      setFlowState("lost")
    }
  }, [gameState.gameStatus, currentTicket, flowState, requestWinSignature])

  // Handle transaction confirmations
  useEffect(() => {
    if (isConfirmed) {
      if (flowState === "buy_tickets") {
        setShowTicketModal(false)
        setFlowState("ready_to_play")
        refetchAttemptBalance()
      } else if (flowState === "starting_attempt" && currentTicket) {
        // Attempt started, now start the actual game
        setFlowState("playing")
        const scene = gameRef.current?.scene.getScene("MainScene") as any
        scene?.startGame()
      } else if (flowState === "claiming") {
        setFlowState("claimed")
        refetchPrizePool()
      }
    }
  }, [isConfirmed, flowState, currentTicket, refetchAttemptBalance, refetchPrizePool])

  // Initialize Phaser
  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return
    if (isInitializingRef.current || gameRef.current) return
    
    isInitializingRef.current = true

    const loadFont = async () => {
      try {
        if (document.fonts.check('400 16px Stengazeta')) return
        
        const font = new FontFace('Stengazeta', 'url(/fonts/Stengazeta-Regular.ttf)', {
          weight: '400',
          style: 'normal',
        })
        await font.load()
        document.fonts.add(font)
        await document.fonts.ready
      } catch (error) {
        console.warn('Failed to load Stengazeta font:', error)
      }
    }

    const checkPhaser = async () => {
      if (typeof Phaser !== "undefined" && containerRef.current && !gameRef.current) {
        await loadFont()
        
        if (!document.fonts.check('400 16px Stengazeta')) {
          await new Promise(resolve => setTimeout(resolve, 200))
          await loadFont()
        }
        
        const MainScene = createMainScene(Phaser)

        if (containerRef.current) {
          containerRef.current.style.width = `${GAME_WIDTH}px`
          containerRef.current.style.height = `${GAME_HEIGHT}px`
        }

        const config: any = {
          type: Phaser.CANVAS,
          width: GAME_WIDTH,
          height: GAME_HEIGHT,
          parent: containerRef.current,
          transparent: true,
          scale: {
            mode: Phaser.Scale.NONE,
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
        
        const renderer = gameRef.current.renderer as any
        if (renderer.gl) {
          const originalPreRender = renderer.preRender?.bind(renderer)
          renderer.preRender = function() {
            renderer.gl.clearColor(0, 0, 0, 0)
            if (originalPreRender) originalPreRender()
          }
        }
        
        setTimeout(() => {
          if (containerRef.current) {
            const canvas = containerRef.current.querySelector('canvas') as HTMLCanvasElement
            if (canvas) {
              canvas.style.backgroundColor = 'transparent'
              canvas.style.background = 'transparent'
              canvas.style.display = 'block'
              canvas.style.setProperty('background', 'transparent', 'important')
              canvas.style.setProperty('background-color', 'transparent', 'important')
            }
          }
        }, 0)
        
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
      if (ticketCount > 0) {
        setFlowState("ready_to_play")
      } else {
        setShowTicketModal(true)
        setFlowState("buy_tickets")
      }
    } else if (flowState === "ready_to_play") {
      // Start attempt on blockchain
      setFlowState("starting_attempt")
      startAttempt()
    }
  }, [phaserLoaded, isConnected, flowState, ticketCount, startAttempt])

  const handleBuyTickets = useCallback(async (amount: 1 | 10 | 50) => {
    await buyTickets(amount)
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
    
    if (ticketCount > 0) {
      setFlowState("ready_to_play")
    } else {
      setFlowState("initial")
    }
  }, [ticketCount, resetContractGame])

  // Button text based on flow state
  const getButtonText = () => {
    switch (flowState) {
      case "initial":
        return ticketCount > 0 ? "▶️ Play" : "🎟️ Buy Tickets"
      case "buy_tickets":
        return "🎟️ Buying..."
      case "ready_to_play":
        return "▶️ Play"
      case "starting_attempt":
        return "⏳ Starting..."
      case "playing":
        return "🎮 Playing..."
      case "won":
        return claimData ? "💰 Claim Prize" : "⏳ Preparing..."
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
        if (ticketCount > 0) {
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
    <div className="flex items-center justify-center p-4">
      <div
        style={{ 
          width: `${GAME_WIDTH}px`,
          height: `${GAME_HEIGHT}px`,
          maxWidth: "100%",
          maxHeight: "calc(100vh - 200px)",
          minWidth: "320px",
          position: "relative",
          backgroundColor: "transparent"
        }}
      >
        {/* Prize Pool and Tickets Display */}
        <div 
          className="flex justify-between items-center px-4"
          style={{ 
            position: 'absolute', 
            top: '10px', 
            left: '0', 
            right: '0', 
            zIndex: 20 
          }}
        >
          {/* Prize Pool */}
          <div 
            className="bg-white/90 backdrop-blur-sm rounded-lg px-4 py-2 shadow-lg"
            style={{ minWidth: '140px' }}
          >
            <div className="text-xs text-gray-500 uppercase tracking-wide">Prize Pool</div>
            <div className="text-xl font-bold text-blue-600">
              {parseFloat(prizePool).toFixed(5)} ETH
            </div>
          </div>

          {/* Tickets */}
          <div 
            className="bg-white/90 backdrop-blur-sm rounded-lg px-4 py-2 shadow-lg"
            style={{ minWidth: '100px' }}
          >
            <div className="text-xs text-gray-500 uppercase tracking-wide">Tickets</div>
            <div className="text-xl font-bold text-green-600">
              🎟️ {ticketCount}
            </div>
          </div>
        </div>

        {/* Phaser Game Container */}
        <div
          ref={containerRef}
          className="overflow-visible"
          style={{ 
            width: `${GAME_WIDTH}px`,
            height: `${GAME_HEIGHT}px`,
            backgroundColor: "transparent",
            position: "relative",
            zIndex: 1,
            pointerEvents: "auto"
          }}
        />

        {/* Control Buttons */}
        <div 
          className="flex gap-4 justify-center" 
          style={{ 
            position: 'absolute', 
            top: '700px', 
            left: '50%', 
            transform: 'translateX(-50%)', 
            zIndex: 10 
          }}
        >
          <button
            onClick={handleShuffle}
            disabled={!phaserLoaded || gameState.gameStatus === "playing" || flowState === "playing"}
            className="px-10 py-4 text-3xl font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            style={{ 
              backgroundColor: '#eef0f3', 
              color: '#0A0B0D'
            }}
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled) {
                e.currentTarget.style.backgroundColor = '#b6f569'
              }
            }}
            onMouseLeave={(e) => {
              if (!e.currentTarget.disabled) {
                e.currentTarget.style.backgroundColor = '#eef0f3'
              }
            }}
          >
            🔀 Shuffle
          </button>
          
          <button
            onClick={handleMainButtonClick}
            disabled={isButtonDisabled()}
            className="px-10 py-4 text-3xl font-bold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            style={{ 
              backgroundColor: flowState === "won" && claimData ? '#66C800' : '#eef0f3', 
              color: flowState === "won" && claimData ? '#FFFFFF' : '#0A0B0D'
            }}
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled) {
                e.currentTarget.style.backgroundColor = flowState === "won" && claimData ? '#4da600' : '#b6f569'
              }
            }}
            onMouseLeave={(e) => {
              if (!e.currentTarget.disabled) {
                e.currentTarget.style.backgroundColor = flowState === "won" && claimData ? '#66C800' : '#eef0f3'
              }
            }}
          >
            {getButtonText()}
          </button>
        </div>

        {/* Footer Text */}
        <div 
          className="text-center" 
          style={{ 
            position: 'absolute', 
            top: '770px', 
            left: '50%', 
            transform: 'translateX(-50%)', 
            width: '100%', 
            zIndex: 10 
          }}
        >
          <p className="text-lg md:text-xl" style={{ color: '#32353d' }}>
            Find your <span style={{ color: '#0000FF' }}>BASE</span> way
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div 
            className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-30"
            style={{ maxWidth: '90%' }}
          >
            {error}
          </div>
        )}

        {/* Ticket Purchase Modal */}
        {showTicketModal && (
          <div 
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => {
              setShowTicketModal(false)
              if (flowState === "buy_tickets") setFlowState("initial")
            }}
          >
            <div 
              className="bg-white rounded-2xl p-6 shadow-2xl max-w-md w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">
                🎟️ Buy Tickets
              </h2>
              
              <div className="space-y-4">
                <button
                  onClick={() => handleBuyTickets(1)}
                  disabled={isProcessing}
                  className="w-full py-4 px-6 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-bold rounded-xl transition-all flex justify-between items-center"
                >
                  <span>1 Ticket</span>
                  <span className="text-sm opacity-80">0.00005 ETH</span>
                </button>
                
                <button
                  onClick={() => handleBuyTickets(10)}
                  disabled={isProcessing}
                  className="w-full py-4 px-6 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-bold rounded-xl transition-all flex justify-between items-center"
                >
                  <span>10 Tickets</span>
                  <span className="text-sm opacity-80">0.0005 ETH</span>
                </button>
                
                <button
                  onClick={() => handleBuyTickets(50)}
                  disabled={isProcessing}
                  className="w-full py-4 px-6 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-300 text-white font-bold rounded-xl transition-all flex justify-between items-center"
                >
                  <span>50 Tickets</span>
                  <span className="text-sm opacity-80">0.0025 ETH</span>
                </button>
              </div>

              {isProcessing && (
                <div className="mt-4 text-center text-gray-500">
                  <div className="animate-spin inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full mr-2"></div>
                  Processing transaction...
                </div>
              )}
              
              <button
                onClick={() => {
                  setShowTicketModal(false)
                  if (flowState === "buy_tickets") setFlowState("initial")
                }}
                className="mt-6 w-full py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-xl transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Not Connected Warning */}
        {!isConnected && phaserLoaded && (
          <div 
            className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-yellow-100 border-2 border-yellow-400 text-yellow-800 px-6 py-4 rounded-xl shadow-lg z-30"
          >
            <p className="font-bold">⚠️ Wallet not connected</p>
            <p className="text-sm">Please connect your wallet to play</p>
          </div>
        )}
      </div>
    </div>
  )
}
