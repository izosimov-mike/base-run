"use client"

import { useEffect, useRef, useState } from "react"

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
      // CRITICAL: No background, no clearing - fully transparent
      // Don't set any background color at all
      // this.cameras.main.setBackgroundColor(0x000000, 0)  // This draws black!
      this.cameras.main.clearBeforeRender = false
      
      console.log('MainScene create() - No background, no clearing')

      // Title
      this.add
        .text(GAME_WIDTH / 2, 50, "Base Run", {
          fontSize: "48px",
          color: "#32353d",
          fontFamily: "Stengazeta",
        })
        .setOrigin(0.5)

      // Status text (hidden initially, will be shown when needed)
      // Position: center between title (y: 50) and top row (y: 180) = ~115
      this.statusText = this.add
        .text(GAME_WIDTH / 2, 120, "", {
          fontSize: "24px",
          color: "#0000FF",
          fontFamily: "Stengazeta",
        })
        .setOrigin(0.5)
        .setVisible(false)

      // Revealed letters display (with spacing from last row)
      // Last row ends at ~620, so 650 gives 30px spacing, let's use 640 for better spacing
      this.revealedText = this.add
        .text(GAME_WIDTH / 2, 640, "", {
          fontSize: "64px",
          color: "#0000FF",
          fontFamily: "Stengazeta",
        })
        .setOrigin(0.5)

      this.setupGame()
    }

    preload() {
      // Background is handled by page CSS, no need to load here
    }

    setupGame() {
      // Clear existing squares and all text objects (letters and skulls)
      this.squares.forEach((row) => {
        row.forEach((sq) => {
          // Destroy square
          sq.destroy()
          
          // Destroy associated text objects if any
          const letterText = sq.getData("letterText")
          if (letterText) {
            letterText.destroy()
          }
        })
      })
      this.squares = []
      this.squareContents = []
      
      // Destroy all text objects in the game area (letters and skulls)
      // Game area is roughly between y: 180 and y: 640
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

      // Always generate random letter positions for each row
      this.gameState.letterPositions = this.gameState.rowSizes.map(
        (size) => Phaser.Math.Between(0, size - 1)
      )

      // Generate content for each row
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
      const lastRowY = startY + 3 * rowSpacing + squareSize

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

          // Hover effects
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

      // Remove question mark if exists
      const questionMark = square.getData("questionMark") as Phaser.GameObjects.Text
      if (questionMark) questionMark.destroy()

      if (content === "skull") {
        // Lost!
        square.setFillStyle(0xFC401F)
        const skullText = this.add
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

        // Reveal all squares
        this.revealAllSquares()
      } else {
        // Found letter!
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
          // Won!
          this.gameState.gameStatus = "won"
          this.statusText.setText("🎉 YOU WIN! You spelled BASE!")
          this.statusText.setColor("#66C800")
          this.statusText.setVisible(true)

          // Celebration effect
          this.createCelebration()
        } else {
        // Next row
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
            // Reveal unrevealed squares
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
          } else if (content !== "skull") {
            // Update already revealed letters to have consistent style
            square.setFillStyle(0xEEF0F3)
            const letterText = square.getData("letterText") as Phaser.GameObjects.Text
            if (letterText) {
              // Force update color to ensure it's #0000FF
              letterText.setColor("#0000FF")
              letterText.setStyle({
                fontSize: "40px",
                color: "#0000FF",
                fontFamily: "Stengazeta",
                fontStyle: "bold"
              })
            } else {
              // If letterText is missing, find and update it
              const textObjects = this.children.list.filter((child: any) => 
                child.type === 'Text' && 
                Math.abs(child.x - square.x) < 5 && 
                Math.abs(child.y - square.y) < 5 &&
                LETTERS.includes(child.text.toLowerCase())
              ) as Phaser.GameObjects.Text[]
              
              textObjects.forEach((textObj: any) => {
                textObj.setColor("#0000FF")
                textObj.setStyle({
                  fontSize: "40px",
                  color: "#0000FF",
                  fontFamily: "Stengazeta",
                  fontStyle: "bold"
                })
              })
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

      // Shuffle row sizes
      const shuffledSizes = Phaser.Utils.Array.Shuffle([...DEFAULT_ROW_SIZES])
      this.gameState.rowSizes = shuffledSizes

      // Reset game state
      this.gameState.currentRow = 0
      this.gameState.gameStatus = "idle"
      this.gameState.revealedLetters = []

      // Clear revealed text
      if (this.revealedText) {
        this.revealedText.setText("")
      }
      
      // Hide status text
      if (this.statusText) {
        this.statusText.setVisible(false)
        this.statusText.setText("")
      }

      // Clear and redraw with new random positions
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
      // Keep current row sizes (don't reset to default)
      // Reset game state and generate new random positions
      const wasPlaying = this.gameState.gameStatus === "playing" || 
                         this.gameState.gameStatus === "lost" || 
                         this.gameState.gameStatus === "won"
      
      this.gameState.currentRow = 0
      this.gameState.gameStatus = "idle"
      this.gameState.revealedLetters = []

      // Regenerate game with same row sizes but new random positions
      this.setupGame()
      
      // Clear UI
      this.statusText.setVisible(false)
      this.statusText.setText("")
      this.revealedText.setText("")
      
      // If was playing/lost/won, immediately start new game
      if (wasPlaying) {
        this.startGame()
      } else {
        this.highlightCurrentRow()
      }
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

  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return
    
    // Prevent multiple initializations
    if (isInitializingRef.current || gameRef.current) return
    
    isInitializingRef.current = true

    // Load Stengazeta font for Phaser
    const loadFont = async () => {
      try {
        // Check if font is already loaded
        if (document.fonts.check('400 16px Stengazeta')) {
          return
        }
        
        const font = new FontFace('Stengazeta', 'url(/fonts/Stengazeta-Regular.ttf)', {
          weight: '400',
          style: 'normal',
        })
        await font.load()
        document.fonts.add(font)
        
        // Wait for fonts to be ready
        await document.fonts.ready
      } catch (error) {
        console.warn('Failed to load Stengazeta font:', error)
      }
    }

    // Wait for Phaser to be loaded from CDN and font to be loaded
    const checkPhaser = async () => {
      if (typeof Phaser !== "undefined" && containerRef.current && !gameRef.current) {
        // Ensure font is loaded
        await loadFont()
        
        // Double check font is available
        if (!document.fonts.check('400 16px Stengazeta')) {
          console.warn('Stengazeta font not available, retrying...')
          await new Promise(resolve => setTimeout(resolve, 200))
          await loadFont()
        }
        
        const MainScene = createMainScene(Phaser)

        // Ensure container has fixed size before creating game
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
        
        // CRITICAL: Hook into WebGL render loop to force transparent clear color every frame
        // Phaser resets clearColor, so we must override it on every render
        const renderer = gameRef.current.renderer as any
        if (renderer.gl) {
          const originalPreRender = renderer.preRender?.bind(renderer)
          renderer.preRender = function() {
            // Force transparent clear color before every render
            renderer.gl.clearColor(0, 0, 0, 0)
            if (originalPreRender) originalPreRender()
          }
          console.log('Hooked into WebGL preRender - will force transparent clear every frame')
        }
        
        // Set canvas styles
        setTimeout(() => {
          if (containerRef.current) {
            const canvas = containerRef.current.querySelector('canvas') as HTMLCanvasElement
            if (canvas) {
              // Make canvas fully transparent via CSS
              canvas.style.backgroundColor = 'transparent'
              canvas.style.background = 'transparent'
              canvas.style.display = 'block'
              canvas.style.setProperty('background', 'transparent', 'important')
              canvas.style.setProperty('background-color', 'transparent', 'important')
              
              console.log('Canvas created:', canvas.width, canvas.height, 'Renderer type:', gameRef.current?.renderer?.type)
            }
          }
        }, 0)
        
        gameRef.current.scene.start("MainScene", { onGameStateChange: setGameState })
        
        setPhaserLoaded(true)
        isInitializingRef.current = false
      } else if (typeof Phaser === "undefined") {
        // Retry after a short delay if Phaser is not yet loaded
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

  const handleShuffle = () => {
    if (gameState.gameStatus === "playing" || !phaserLoaded) return
    const scene = gameRef.current?.scene.getScene("MainScene") as any
    scene?.shuffle()
  }

  const handlePlay = () => {
    if (!phaserLoaded) return
    const scene = gameRef.current?.scene.getScene("MainScene") as any
    if (gameState.gameStatus === "idle") {
      scene?.startGame()
    } else {
      scene?.resetGame()
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

        <div className="flex gap-4 justify-center" style={{ position: 'absolute', top: '700px', left: '50%', transform: 'translateX(-50%)', zIndex: 10 }}>
          <button
            onClick={handleShuffle}
            disabled={!phaserLoaded || gameState.gameStatus === "playing"}
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
            onClick={handlePlay}
            disabled={!phaserLoaded}
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
            {gameState.gameStatus === "idle" ? "▶️ Play" : "🔄 Restart"}
          </button>
        </div>

        <div className="text-center" style={{ position: 'absolute', top: '770px', left: '50%', transform: 'translateX(-50%)', width: '100%', zIndex: 10 }}>
          <p className="text-lg md:text-xl" style={{ color: '#32353d' }}>
            Find your <span style={{ color: '#0000FF' }}>BASE</span> way
          </p>
        </div>
      </div>
    </div>
  )
}
