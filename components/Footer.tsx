'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import MobileNavSheet from './MobileNavSheet'

export default function Footer() {
  const pathname = usePathname()
  const [isNavSheetOpen, setIsNavSheetOpen] = useState(false)

  const isActive = (path: string) => pathname === path

  return (
    <>
      <footer className="hidden md:block bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 py-4">
        <div className="container mx-auto px-4 flex justify-between items-center">
          <p className="text-sm text-gray-500">
            © {new Date().getFullYear()} letsboulder
          </p>
          <nav className="flex gap-6 text-sm items-center">
            <Link href="/privacy" className="mt-1 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
              Privacy
            </Link>
            <Link href="/gym-owners" className="mt-1 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
              Gym Owners
            </Link>
            <Link href="/terms" className="mt-1 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
              Terms
            </Link>
            <a href="https://discord.gg/vzAEMr2qrY" target="_blank" rel="noopener noreferrer" className="mt-1 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
              Discord
            </a>
            <a 
              href="https://reddit.com/r/letsboulder" 
              className="bg-[#FF4500] text-white px-4 py-2 rounded-full font-bold hover:bg-orange-600 transition"
            >
              Discuss on Reddit
            </a>
          </nav>
        </div>
      </footer>

      <footer className="fixed bottom-0 left-0 right-0 z-[1100] bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 md:hidden pb-[env(safe-area-inset-bottom,0px)]">
        <nav className="flex justify-around py-1">
          <Link href="/logbook" className={`flex flex-col items-center p-2 ${isActive('/logbook') ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-[10px] mt-0.5">Logbook</span>
          </Link>
          <Link href="/" className={`flex flex-col items-center p-2 ${isActive('/') ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <span className="text-[10px] mt-0.5">Map</span>
          </Link>
          <Link href="/submit" className={`flex flex-col items-center p-2 ${isActive('/submit') ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-[10px] mt-0.5">Upload</span>
          </Link>
          <button
            onClick={() => setIsNavSheetOpen(true)}
            className={`flex flex-col items-center p-2 ${isActive('/logbook') || isActive('/gear') || isActive('/impact') || isActive('/about') || isActive('/settings') ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
            </svg>
            <span className="text-[10px] mt-0.5">More</span>
          </button>
        </nav>
      </footer>

      <MobileNavSheet isOpen={isNavSheetOpen} onClose={() => setIsNavSheetOpen(false)} />
    </>
  )
}
