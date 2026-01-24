// Backend API client for game verification
const BACKEND_URL = 'https://baserun-backend.vercel.app'

const DEBUG = typeof window !== 'undefined' && (
  (window as any).__BASERUN_DEBUG__ === true ||
  /[?&]debug=1/.test(window.location.search)
)

function log(label: string, ...args: unknown[]) {
  if (DEBUG) {
    console.log(`[Backend ${label}]`, ...args)
  }
}

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
    log('start', { ticketId, player: player.slice(0, 10) + '...', prizeSnapshot })
    const url = `${BACKEND_URL}/api/start`
    const response = await fetch(url, {
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

    const text = await response.text()
    let data: StartGameResponse & { error?: string }
    try {
      data = JSON.parse(text)
    } catch {
      log('start', 'response not JSON', response.status, text.slice(0, 200))
      throw new Error(`Start failed: ${response.status}`)
    }
    log('start', 'response', response.status, data)

    if (!response.ok) {
      throw new Error(data.error || 'Failed to start game')
    }

    return data
  },

  /**
   * Send a click to the backend for verification
   */
  async click(ticketId: string, row: number, col: number): Promise<ClickResponse> {
    log('click', { ticketId, row, col })
    const url = `${BACKEND_URL}/api/click`
    const response = await fetch(url, {
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

    const text = await response.text()
    let data: ClickResponse & { error?: string }
    try {
      data = JSON.parse(text)
    } catch {
      log('click', 'response not JSON', response.status, text.slice(0, 200))
      throw new Error(`Click failed: ${response.status} ${text.slice(0, 80)}`)
    }
    log('click', 'response', response.status, data)

    if (!response.ok && data.result !== 'miss' && data.result !== 'bot_detected') {
      throw new Error(data.error || 'Failed to process click')
    }

    return data
  },

  /**
   * Finish the game and get win signature
   */
  async finish(ticketId: string): Promise<FinishResponse> {
    log('finish', { ticketId })
    const response = await fetch(`${BACKEND_URL}/api/finish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ticketId,
      }),
    })

    const text = await response.text()
    let data: FinishResponse & { error?: string }
    try {
      data = JSON.parse(text)
    } catch {
      log('finish', 'response not JSON', response.status, text.slice(0, 200))
      throw new Error(`Finish failed: ${response.status}`)
    }
    log('finish', 'response', response.status, data.success ? 'ok' : data.error)

    if (!response.ok) {
      throw new Error(data.error || 'Failed to finish game')
    }

    return data
  },

  /**
   * Get game status (for debugging/recovery)
   */
  async getStatus(ticketId: string): Promise<StatusResponse> {
    log('status', { ticketId })
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
