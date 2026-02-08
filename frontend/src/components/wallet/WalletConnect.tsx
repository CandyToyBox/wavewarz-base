'use client';

import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
  WalletDropdownLink,
} from '@coinbase/onchainkit/wallet';
import {
  Address,
  Avatar,
  Name,
  Identity,
  EthBalance,
} from '@coinbase/onchainkit/identity';
import { useAccount } from 'wagmi';

export function WalletConnect() {
  const { isConnected } = useAccount();

  return (
    <Wallet>
      <ConnectWallet
        className="bg-wave-blue hover:bg-wave-blue/80 text-deep-space font-rajdhani font-bold px-4 py-2 rounded-lg transition-colors"
        text="Connect Wallet"
      >
        <Avatar className="h-6 w-6" />
        <Name className="text-white" />
      </ConnectWallet>
      <WalletDropdown className="bg-deep-space border border-wave-blue/30 rounded-xl">
        <Identity
          className="p-4 border-b border-wave-blue/20"
          hasCopyAddressOnClick
        >
          <Avatar className="h-12 w-12" />
          <Name className="text-white font-rajdhani text-lg" />
          <Address className="text-ww-grey font-mono text-sm" />
          <EthBalance className="text-wave-blue font-semibold" />
        </Identity>
        <WalletDropdownLink
          className="text-ww-grey hover:text-white hover:bg-wave-blue/10 px-4 py-3"
          icon="wallet"
          href="https://wallet.coinbase.com"
          target="_blank"
        >
          View in Coinbase Wallet
        </WalletDropdownLink>
        <WalletDropdownDisconnect className="text-red-400 hover:text-red-300 hover:bg-red-500/10 px-4 py-3" />
      </WalletDropdown>
    </Wallet>
  );
}

// Simplified version for mobile/compact views
export function WalletConnectCompact() {
  const { address, isConnected } = useAccount();

  if (!isConnected) {
    return (
      <Wallet>
        <ConnectWallet
          className="btn-primary text-sm py-2"
          text="Connect"
        />
      </Wallet>
    );
  }

  return (
    <Wallet>
      <ConnectWallet className="btn-secondary text-sm py-2">
        <Avatar className="h-5 w-5" />
        <Name />
      </ConnectWallet>
      <WalletDropdown className="bg-deep-space border border-wave-blue/30 rounded-xl">
        <Identity className="p-4" hasCopyAddressOnClick>
          <Avatar className="h-10 w-10" />
          <Name className="text-white" />
          <EthBalance className="text-wave-blue" />
        </Identity>
        <WalletDropdownDisconnect className="text-red-400 px-4 py-3" />
      </WalletDropdown>
    </Wallet>
  );
}

export default WalletConnect;
