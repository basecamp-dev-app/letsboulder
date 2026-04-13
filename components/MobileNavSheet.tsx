'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { VisuallyHidden } from '@/components/ui/visually-hidden'
import { MOBILE_NAV_SECTIONS } from '@/lib/nav-items'
import { suppressOverlayCleanup, useOverlayHistory } from '@/hooks/useOverlayHistory'
import { csrfFetch } from '@/lib/csrf-client'
import { useLazyAuthUser } from '@/components/use-lazy-auth-user'

interface MobileNavSheetProps {
  isOpen: boolean
  onClose: () => void
}

const NAV_ITEM_ICONS: Record<string, React.ReactNode> = {
  Logbook: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  Gear: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  Impact: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
  About: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Support: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 21s-6.716-4.33-9-8.288C1.22 9.587 2.912 6 6.75 6c2.013 0 3.128 1.126 3.75 2.25C11.122 7.126 12.237 6 14.25 6 18.088 6 19.78 9.587 21 12.712 18.716 16.67 12 21 12 21z" />
    </svg>
  ),
  Settings: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

export default function MobileNavSheet({ isOpen, onClose }: MobileNavSheetProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, load: loadAuthUser } = useLazyAuthUser()

  useOverlayHistory({ open: isOpen, onClose, id: 'mobile-nav-sheet' })

  useEffect(() => {
    if (isOpen) {
      void loadAuthUser()
    }
  }, [isOpen, loadAuthUser])

  const handleNavigation = (href: string) => {
    suppressOverlayCleanup('mobile-nav-sheet')
    onClose()
    router.replace(href)
  }

  const handleSignOut = async () => {
    suppressOverlayCleanup('mobile-nav-sheet')
    onClose()
    const response = await csrfFetch('/api/auth/signout', { method: 'POST' })
    if (!response.ok) return
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const channel = new BroadcastChannel('auth-cache-clear')
      channel.postMessage({ type: 'CLEAR_AUTH_CACHES' })
      channel.close()
    }
    router.replace('/')
  }

  const handleSignIn = () => {
    suppressOverlayCleanup('mobile-nav-sheet')
    onClose()
    router.replace('/auth')
  }

  const renderNavSection = (title: string, items: Array<{ label: string; href: string }>) => {
    if (items.length === 0) return null

    return (
      <div className="space-y-1">
        <p className="px-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">{title}</p>
        {items.map((item) => (
          <button
            key={item.href}
            type="button"
            onClick={() => handleNavigation(item.href)}
            className={`w-full flex items-center gap-4 px-4 py-3 rounded-lg text-left transition-colors ${
              pathname === item.href
                ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <span className={pathname === item.href ? 'text-gray-900 dark:text-white' : 'text-gray-500'}>
              {NAV_ITEM_ICONS[item.label]}
            </span>
            <span className="font-medium">{item.label}</span>
          </button>
        ))}
      </div>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[4000]"
        className="top-auto bottom-0 left-0 right-0 z-[4001] max-w-none translate-x-0 translate-y-0 rounded-t-2xl rounded-b-none border-0 p-4 sm:max-w-none data-[state=closed]:slide-out-to-bottom-0 data-[state=open]:slide-in-from-bottom-0"
      >
        <VisuallyHidden>
          <DialogTitle>Navigation menu</DialogTitle>
        </VisuallyHidden>
        <VisuallyHidden>
          <DialogDescription>Access letsboulder destinations, track your climbs, and manage your account.</DialogDescription>
        </VisuallyHidden>
        <div className="w-12 h-1 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto mb-4" aria-hidden="true" />
        <nav className="space-y-4" aria-label="Primary navigation">
          {MOBILE_NAV_SECTIONS.map((section) => renderNavSection(section.label, section.items))}

          <div className="border-t border-gray-200 pt-3 dark:border-gray-800">
            {user ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center gap-4 px-4 py-3 rounded-lg text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="font-medium">Logout</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSignIn}
                className="w-full flex items-center gap-4 px-4 py-3 rounded-lg text-left text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                <span className="font-medium">Login</span>
              </button>
            )}
          </div>
        </nav>
      </DialogContent>
    </Dialog>
  )
}
