'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { LEGAL_NAV_ITEMS, isNavItemActive } from '@/lib/nav-items'

type StandaloneLayoutProps = {
  children: React.ReactNode
  backHref?: string
  backLabel?: string
  showLegalNavigation?: boolean
}

export default function StandaloneLayout({
  children,
  backHref = '/',
  backLabel = 'Back to letsboulder',
  showLegalNavigation = false,
}: StandaloneLayoutProps) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex min-h-14 w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2">
          <Link href="/" className="rounded-md text-xl font-black tracking-[-0.04em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-2xl">
            letsboulder
          </Link>
          <Link href={backHref} className="inline-flex min-h-9 items-center rounded-md px-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            ← {backLabel}
          </Link>
        </div>
        {showLegalNavigation ? (
          <nav aria-label="Legal navigation" className="border-t border-border">
            <div className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-4 py-2">
              {LEGAL_NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isNavItemActive(pathname, item) ? 'page' : undefined}
                  className={`inline-flex min-h-9 shrink-0 items-center rounded-md px-3 text-sm hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isNavItemActive(pathname, item)
                      ? 'bg-muted font-semibold text-foreground underline decoration-2 underline-offset-4'
                      : 'text-muted-foreground'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        ) : null}
      </header>

      <main id="main-content" tabIndex={-1} className="min-h-0 flex-1 focus:outline-none">
        {children}
      </main>

      <footer className="border-t border-border bg-muted/30">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} letsboulder</p>
          <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-4 gap-y-2">
            {LEGAL_NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isNavItemActive(pathname, item) ? 'page' : undefined}
                className="inline-flex min-h-6 items-center hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:font-semibold aria-[current=page]:text-foreground aria-[current=page]:underline"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  )
}
