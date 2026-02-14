import { http, createConfig } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { coinbaseWallet } from 'wagmi/connectors';

// WaveWarz Base wagmi configuration
// Uses Coinbase Smart Wallet as primary connector for Base chain
export const wagmiConfig = createConfig({
  chains: [base, baseSepolia],
  connectors: [
    coinbaseWallet({
      appName: 'WaveWarz Base',
      preference: 'smartWalletOnly', // Use Coinbase Smart Wallet
    }),
  ],
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
  },
  ssr: true,
});

// Contract addresses (update after deployment)
export const CONTRACTS = {
  // Base Mainnet
  mainnet: {
    waveWarzBase: '' as `0x${string}`,
    musicNFT: '' as `0x${string}`,
    marketplace: '' as `0x${string}`,
  },
  // Base Sepolia Testnet
  testnet: {
    waveWarzBase: '0xe28709DF5c77eD096f386510240A4118848c1098' as `0x${string}`,
    musicNFT: '' as `0x${string}`,
    marketplace: '' as `0x${string}`,
  },
} as const;

// Network configuration
export const NETWORK_CONFIG = {
  production: base,
  development: baseSepolia,
} as const;

// Get current network based on environment
export function getCurrentNetwork() {
  return process.env.NEXT_PUBLIC_NETWORK === 'mainnet'
    ? NETWORK_CONFIG.production
    : NETWORK_CONFIG.development;
}

// Get contract addresses for current network
export function getContracts() {
  return process.env.NEXT_PUBLIC_NETWORK === 'mainnet'
    ? CONTRACTS.mainnet
    : CONTRACTS.testnet;
}
