'use client'

import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 md:hidden">
      <nav className="flex justify-around py-3">
        <Link href="/contribute" className="flex flex-col items-center text-gray-600 hover:text-gray-900">
          <span className="text-lg">📝</span>
          <span className="text-xs mt-1">Contribute</span>
        </Link>
        <Link href="/logbook" className="flex flex-col items-center text-gray-600 hover:text-gray-900">
          <span className="text-lg">✅</span>
          <span className="text-xs mt-1">My climbs</span>
        </Link>
        <Link href="/map" className="flex flex-col items-center text-gray-600 hover:text-gray-900">
          <span className="text-lg">🗺️</span>
          <span className="text-xs mt-1">Map</span>
        </Link>
      </nav>
    </footer>
  )
}
