'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  DONATE_NAV_ITEM,
  isLogbookRoute,
  isNavigationMenuRoute,
  isSubmitRoute,
} from '@/lib/nav-items'
import MobileNavSheet from './MobileNavSheet'

const FeedbackButton = dynamic(() => import('@/components/feedback/FeedbackButton').then(mod => mod.default), { ssr: false })

export default function Footer() {
  const pathname = usePathname()
  const [isNavSheetOpen, setIsNavSheetOpen] = useState(false)

  const isActive = (path: string) => pathname === path
  const footerLinkClassName = 'inline-flex min-h-6 items-center text-gray-500 hover:text-gray-900 hover:underline dark:text-gray-400 dark:hover:text-gray-100 aria-[current=page]:font-semibold aria-[current=page]:text-gray-900 aria-[current=page]:underline dark:aria-[current=page]:text-gray-100'

  return (
    <>
      <footer className="hidden md:block bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 py-4">
        <div className="container mx-auto px-4 flex justify-between items-center">
          <p className="text-sm text-gray-500">
            © {new Date().getFullYear()} letsboulder
          </p>
          <nav aria-label="Footer navigation" className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2 text-sm">
            <Link href="/about" aria-current={isActive('/about') ? 'page' : undefined} className={footerLinkClassName}>
              About
            </Link>
            <Link href="/impact" aria-current={isActive('/impact') ? 'page' : undefined} className={footerLinkClassName}>
              Community impact
            </Link>
            <Link href="/about#support" className={footerLinkClassName}>
              Support letsboulder
            </Link>
            <a
              href={DONATE_NAV_ITEM.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${DONATE_NAV_ITEM.label} (opens in a new tab)`}
              className="inline-flex items-center rounded-full bg-emerald-600 px-3 py-1.5 font-medium text-white transition-colors hover:bg-emerald-700"
            >
              {DONATE_NAV_ITEM.label} <span aria-hidden="true">↗</span>
            </a>
            <Link href="/privacy" aria-current={isActive('/privacy') ? 'page' : undefined} className={footerLinkClassName}>
              Privacy
            </Link>
            <Link href="/gym-owners" aria-current={isActive('/gym-owners') ? 'page' : undefined} className={footerLinkClassName}>
              For gym owners
            </Link>
            <Link href="/terms" aria-current={isActive('/terms') ? 'page' : undefined} className={footerLinkClassName}>
              Terms
            </Link>
            <Link href="/cookies" aria-current={isActive('/cookies') ? 'page' : undefined} className={footerLinkClassName}>
              Cookies
            </Link>
            <Link href="/cookies#privacy-choices" className={footerLinkClassName}>
              Privacy choices
            </Link>
            <Link href="/open-data-terms" aria-current={isActive('/open-data-terms') ? 'page' : undefined} className={footerLinkClassName}>
              Open data terms
            </Link>
          </nav>
        </div>
      </footer>

      <footer className="fixed bottom-0 left-0 right-0 z-[1100] bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 md:hidden pb-[env(safe-area-inset-bottom,0px)]">
        <nav aria-label="Mobile primary navigation" className="flex h-16 justify-around py-1">
          <Link href="/" aria-current={isActive('/') ? 'page' : undefined} className={`flex min-h-12 min-w-12 flex-col items-center rounded-lg p-2 ${isActive('/') ? 'bg-gray-100 font-semibold text-gray-900 dark:bg-gray-800 dark:text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <span className="text-[10px] mt-0.5">Map</span>
          </Link>
          <Link href="/logbook" aria-current={isLogbookRoute(pathname) ? 'page' : undefined} className={`flex min-h-12 min-w-12 flex-col items-center rounded-lg p-2 ${isLogbookRoute(pathname) ? 'bg-gray-100 font-semibold text-gray-900 dark:bg-gray-800 dark:text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-[10px] mt-0.5">Logbook</span>
          </Link>
          <Link href="/submit" aria-current={isSubmitRoute(pathname) ? 'page' : undefined} className={`flex min-h-12 min-w-12 flex-col items-center rounded-lg p-2 ${isSubmitRoute(pathname) ? 'bg-gray-100 font-semibold text-gray-900 dark:bg-gray-800 dark:text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-[10px] mt-0.5">Add topo</span>
          </Link>
          <button
            onClick={() => setIsNavSheetOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={isNavSheetOpen}
            aria-label="Open navigation menu"
            className={`flex min-h-12 min-w-12 flex-col items-center rounded-lg p-2 ${isNavigationMenuRoute(pathname) ? 'bg-gray-100 font-semibold text-gray-900 dark:bg-gray-800 dark:text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 12a3 3 0 100-6 3 3 0 000 6zm0 2c-4.418 0-8 1.79-8 4v1h16v-1c0-2.21-3.582-4-8-4z" />
            </svg>
            <span className="text-[10px] mt-0.5" aria-hidden="true">Menu</span>
          </button>
        </nav>
      </footer>

      <MobileNavSheet isOpen={isNavSheetOpen} onClose={() => setIsNavSheetOpen(false)} />
      <FeedbackButton />
    </>
  )
}
