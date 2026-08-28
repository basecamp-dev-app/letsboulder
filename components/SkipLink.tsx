'use client'

import type { MouseEvent } from 'react'

export default function SkipLink() {
  const focusMainContent = (event: MouseEvent<HTMLAnchorElement>) => {
    const main = document.getElementById('main-content')
    if (!main) return

    event.preventDefault()
    main.focus()
    window.history.replaceState(null, '', '#main-content')
  }

  return (
    <a
      href="#main-content"
      onClick={focusMainContent}
      className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[9999] focus:rounded-md focus:bg-gray-900 focus:px-4 focus:py-2 focus:text-white focus:outline-none focus:ring-2 focus:ring-white"
    >
      Skip to main content
    </a>
  )
}
