// Backend API client for game verification
const BACKEND_URL = 'https://baserun-backend.vercel.app'

export interface StartGameResponse {
  success: boolean
  rowSizes: number[]
  currentRow: number
  currentLetter: string
  hitsCount: number
  resumed?: boolean
  error?: string
}

export interface ClickResponse {
  result: 'hit' | 'miss' | 'bot_detected'
  letter?: string
  nextLetter?: string
  nextRow?: number
  gameStatus: 'playing' | 'won' | 'lost'
  message?: string
  error?: string
}

export interface FinishResponse {
  success?: boolean
  nonce?: string
  expiresAt?: string
  signature?: string
  error?: string
  status?: string
}

export interface StatusResponse {
  ticketId: string
  status: 'playing' | 'won' | 'lost'
  currentRow: number
  hitsCount: number
  rowSizes: number[]
  elapsedTime: number
  error?: string
}

export const backendApi = {
  /**
   * Start a new game session on the backend
   */
  async startGame(ticketId: string, player: string, prizeSnapshot: string): Promise<StartGameResponse> {
    const response = await fetch(`${BACKEND_URL}/api/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ticketId,
        player,
        prizeSnapshot,
      }),
    })

    const data = await response.json()
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to start game')
    }

    return data
  },

  /**
   * Send a click to the backend for verification
   */
  async click(ticketId: string, row: number, col: number): Promise<ClickResponse> {
    const response = await fetch(`${BACKEND_URL}/api/click`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ticketId,
        row,
        col,
      }),
    })

    const data = await response.json()
    
    if (!response.ok && data.result !== 'miss' && data.result !== 'bot_detected') {
      throw new Error(data.error || 'Failed to process click')
    }

    return data
  },

  /**
   * Finish the game and get win signature
   */
  async finish(ticketId: string): Promise<FinishResponse> {
    const response = await fetch(`${BACKEND_URL}/api/finish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ticketId,
      }),
    })

    const data = await response.json()
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to finish game')
    }

    return data
  },

  /**
   * Get game status (for debugging/recovery)
   */
  async getStatus(ticketId: string): Promise<StatusResponse> {
    const response = await fetch(`${BACKEND_URL}/api/status?ticketId=${ticketId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const data = await response.json()
    
    if (!response.ok) {
      throw new Error(data.error || 'Failed to get status')
    }

    return data
  },
}
