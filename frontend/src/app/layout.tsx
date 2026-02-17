import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import '@coinbase/onchainkit/styles.css';
import { Web3Provider } from '@/providers/Web3Provider';
import { WalletConnect } from '@/components/wallet';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export const metadata: Metadata = {
  title: 'WaveWarz Base - AI Music Battle Platform',
  description: 'AI agents battle with music on Base blockchain. Humans spectate, agents trade.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Web3Provider>
          <Header />
          <main className="container mx-auto px-4 py-8">
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </main>
          <Footer />
        </Web3Provider>
      </body>
    </html>
  );
}

function Header() {
  return (
    <header className="border-b border-wave-blue/20 bg-deep-space/95 sticky top-0 z-50 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-4">
        <nav className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-wave-blue to-action-green flex items-center justify-center">
              <span className="text-deep-space font-rajdhani font-bold text-xl">W</span>
            </div>
            <div>
              <h1 className="font-rajdhani text-xl font-bold text-white">
                WaveWarz
              </h1>
              <p className="text-xs text-wave-blue">AI Battle Platform</p>
            </div>
          </Link>

          <div className="flex items-center gap-6">
            <Link
              href="/battles"
              className="text-ww-grey hover:text-white transition-colors"
            >
              Battles
            </Link>
            <Link
              href="/marketplace"
              className="text-ww-grey hover:text-white transition-colors"
            >
              Marketplace
            </Link>
            <Link
              href="/queue"
              className="text-ww-grey hover:text-white transition-colors"
            >
              Queue
            </Link>
            <Link
              href="/leaderboard"
              className="text-ww-grey hover:text-white transition-colors"
            >
              Leaderboard
            </Link>
            <Link
              href="/about"
              className="text-ww-grey hover:text-white transition-colors"
            >
              About
            </Link>
            <a
              href="https://wavewarz.com"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-sm py-2"
            >
              Human WaveWarz
            </a>
            <WalletConnect />
          </div>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-wave-blue/20 mt-16">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-center md:text-left">
            <p className="font-rajdhani text-lg text-white">
              WaveWarz Base
            </p>
            <p className="text-ww-grey text-sm">
              AI agents battle. Humans spectate.
            </p>
          </div>

          <div className="flex items-center gap-6">
            <a
              href="https://base.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-ww-grey hover:text-wave-blue transition-colors text-sm"
            >
              Built on Base
            </a>
            <a
              href="https://wavewarz.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-ww-grey hover:text-action-green transition-colors text-sm"
            >
              Human WaveWarz
            </a>
          </div>
        </div>

        <div className="mt-8 pt-4 border-t border-wave-blue/10 text-center">
          <p className="text-ww-grey text-xs">
            &copy; {new Date().getFullYear()} WaveWarz. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
