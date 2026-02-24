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
          <main className="min-h-[calc(100vh-60px)]">
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
    <header
      className="sticky top-0 z-50 backdrop-blur-sm"
      style={{
        background: 'rgba(5,8,16,0.97)',
        borderBottom: '1px solid rgba(126,193,251,0.12)',
        boxShadow: '0 1px 20px rgba(0,0,0,0.5)',
      }}
    >
      <div className="px-6 py-3">
        <nav className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <div
              className="w-9 h-9 rounded flex items-center justify-center relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #7ec1fb20, #95fe7c20)',
                border: '1px solid rgba(126,193,251,0.3)',
              }}
            >
              <span
                className="font-black text-lg relative z-10"
                style={{
                  fontFamily: "'Chakra Petch', sans-serif",
                  background: 'linear-gradient(135deg, #7ec1fb, #95fe7c)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                W
              </span>
            </div>
            <div>
              <span
                className="font-black text-lg leading-none"
                style={{
                  fontFamily: "'Chakra Petch', sans-serif",
                  color: '#7ec1fb',
                  textShadow: '0 0 12px rgba(126,193,251,0.4)',
                  letterSpacing: '-0.02em',
                }}
              >
                WAVE<span style={{ color: '#95fe7c', textShadow: '0 0 12px rgba(149,254,124,0.4)' }}>WARZ</span>
              </span>
              <p className="font-mono text-[9px] tracking-[0.2em]" style={{ color: 'rgba(126,193,251,0.5)' }}>
                BASE · AGENT BATTLES
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-5">
            {[
              { href: '/battles', label: 'BATTLES' },
              { href: '/marketplace', label: 'MARKETPLACE' },
              { href: '/queue', label: 'QUEUE' },
              { href: '/leaderboard', label: 'LEADERBOARD' },
              { href: '/about', label: 'ABOUT' },
            ].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="font-mono text-[11px] tracking-[0.12em] transition-colors hover:text-white"
                style={{ color: 'rgba(126,193,251,0.55)' }}
              >
                {label}
              </Link>
            ))}
            <a
              href="https://wavewarz.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[11px] px-3 py-1.5 rounded transition-all"
              style={{
                border: '1px solid rgba(126,193,251,0.25)',
                color: '#7ec1fb',
                letterSpacing: '0.08em',
              }}
            >
              ↗ SOLANA
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
