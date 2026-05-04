import Link from 'next/link';
import { Github } from 'lucide-react';
import { JupiterWalletPromo } from '@/components/JupiterWalletPromo';

export function Footer() {
  return (
    <footer
      data-testid="site-footer"
      className="border-t border-border mt-24"
    >
      <div className="container py-12 grid gap-10 md:grid-cols-2">
        <div>
          <div className="text-lg font-semibold">
            Root<span className="text-sol-green">Record</span>{' '}
            <span className="text-muted-foreground text-sm font-normal">
              / Solana Tools
            </span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground max-w-sm">
            On-chain tools that respect <em className="text-foreground/90">your SOL</em>,{' '}
            <em className="text-foreground/90">your time</em>, and{' '}
            <em className="text-foreground/90">your tokens</em>.
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            Main site:{' '}
            <a
              href="https://rootrecord.info"
              target="_blank"
              rel="noreferrer"
              className="text-foreground hover:text-sol-green underline-offset-4 hover:underline"
            >
              rootrecord.info
            </a>
          </p>
        </div>

        <div className="grid grid-cols-1 gap-8 text-sm sm:grid-cols-3">
          <div>
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-3">
              Legal
            </div>
            <ul className="space-y-2">
              <li>
                <Link href="/privacy" className="hover:text-sol-green">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-sol-green">
                  Terms
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-3">
              Program
            </div>
            <ul className="space-y-2">
              <li>
                <Link href="/ecosystem" className="hover:text-sol-green">
                  Ecosystem
                </Link>
              </li>
              <li>
                <Link href="/liquidity-timing" className="hover:text-sol-green">
                  Liquidity timing
                </Link>
              </li>
              <li>
                <Link href="/tokenomics" className="hover:text-sol-green">
                  Tokenomics
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground mb-3">
              Open
            </div>
            <a
              href="https://github.com/RootRecord?tab=repositories"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-foreground hover:text-sol-green"
            >
              <Github className="h-4 w-4" /> GitHub
            </a>
            <p className="mt-6 text-xs text-muted-foreground">
              Made with respect for users. Not financial advice. Verify every
              transaction in your wallet before signing.
            </p>
          </div>
        </div>
      </div>
      <div className="border-t border-border bg-ink-900/40">
        <div className="container py-6">
          <JupiterWalletPromo variant="compact" />
        </div>
      </div>
      <div className="border-t border-border">
        <div className="container py-5 text-xs text-muted-foreground flex justify-between">
          <span>© {new Date().getFullYear()} RootRecord</span>
          <span>solana.rootrecord.info</span>
        </div>
      </div>
    </footer>
  );
}
