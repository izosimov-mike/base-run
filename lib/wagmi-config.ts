import { http, createConfig } from 'wagmi'
import { base, mainnet } from 'wagmi/chains'
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector'
import { Attribution } from 'ox/erc8021'

// ERC-8021 Builder Code data suffix for onchain attribution
const DATA_SUFFIX = Attribution.toDataSuffix({
  codes: ['bc_grrqwduu'],
})

export const config = createConfig({
  chains: [base, mainnet],
  transports: {
    [base.id]: http(),
    [mainnet.id]: http(),
  },
  connectors: [
    farcasterMiniApp()
  ],
  dataSuffix: DATA_SUFFIX,
})

// Export chains for use in other components
export { base, mainnet }
