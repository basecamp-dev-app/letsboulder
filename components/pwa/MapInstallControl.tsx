'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, X } from 'lucide-react'

type BeforeInstallPromptOutcome = 'accepted' | 'dismissed'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: BeforeInstallPromptOutcome; platform: string }>
}

const ANDROID_HIDE_UNTIL_KEY = 'pwa_android_prompt_hidden_until'
const IOS_HIDE_UNTIL_KEY = 'pwa_ios_tip_hidden_until'

function readHideUntil(key: string): number {
  if (typeof window === 'undefined') return 0
  const raw = window.localStorage.getItem(key)
  if (!raw) return 0
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

function setHideForDays(key: string, days: number) {
  if (typeof window === 'undefined') return
  const ms = Math.max(0, days) * 24 * 60 * 60 * 1000
  window.localStorage.setItem(key, String(Date.now() + ms))
}

function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false
  const mqStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches ?? false
  const iosStandalone = (navigator as unknown as { standalone?: boolean }).standalone === true
  return mqStandalone || iosStandalone
}

export default function MapInstallControl() {
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null)
  const [androidEligible, setAndroidEligible] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [iosPopoverOpen, setIosPopoverOpen] = useState(false)

  const hideAndroidUntil = readHideUntil(ANDROID_HIDE_UNTIL_KEY)
  const hideIosUntil = readHideUntil(IOS_HIDE_UNTIL_KEY)

  useEffect(() => {
    setInstalled(isStandaloneMode())

    const mq = window.matchMedia?.('(display-mode: standalone)')
    const handleChange = () => {
      setInstalled(isStandaloneMode())
    }
    mq?.addEventListener?.('change', handleChange)
    window.addEventListener('focus', handleChange)
    return () => {
      mq?.removeEventListener?.('change', handleChange)
      window.removeEventListener('focus', handleChange)
    }
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      if (installed) return
      const bip = e as BeforeInstallPromptEvent
      if (typeof bip.prompt !== 'function') return
      e.preventDefault()
      deferredPromptRef.current = bip
      setAndroidEligible(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [installed])

  useEffect(() => {
    if (!iosPopoverOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIosPopoverOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [iosPopoverOpen])

  const showAndroidButton = !installed && androidEligible && Date.now() >= hideAndroidUntil
  const showIosButton = !installed && isIosDevice() && Date.now() >= hideIosUntil

  if (!showAndroidButton && !showIosButton) return null

  return (
    <div className="absolute left-4 top-[168px] z-[1100]">
      {showAndroidButton && (
        <button
          onClick={async () => {
            const promptEvent = deferredPromptRef.current
            if (!promptEvent) return

            try {
              await promptEvent.prompt()
              const choice = await promptEvent.userChoice
              if (choice?.outcome === 'dismissed') {
                setHideForDays(ANDROID_HIDE_UNTIL_KEY, 30)
              } else {
                setHideForDays(ANDROID_HIDE_UNTIL_KEY, 3650)
              }
            } finally {
              deferredPromptRef.current = null
              setAndroidEligible(false)
            }
          }}
          className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 text-xs shadow-md flex items-center gap-1.5 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          <Download className="w-3.5 h-3.5" />
          Install app
        </button>
      )}

      {!showAndroidButton && showIosButton && (
        <div className="relative">
          <button
            onClick={() => setIosPopoverOpen((v) => !v)}
            className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 text-xs shadow-md flex items-center gap-1.5 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            <Download className="w-3.5 h-3.5" />
            Install app
          </button>

          {iosPopoverOpen && (
            <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 w-[240px] rounded-xl border border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-950/95 shadow-xl backdrop-blur px-3 py-2 text-xs text-gray-800 dark:text-gray-200">
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold text-gray-900 dark:text-gray-100">Install letsboulder</div>
                <button
                  aria-label="Close"
                  onClick={() => {
                    setHideForDays(IOS_HIDE_UNTIL_KEY, 30)
                    setIosPopoverOpen(false)
                  }}
                  className="rounded-md p-1 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="mt-1 leading-snug text-gray-700 dark:text-gray-300">
                Tap <span className="font-medium">Share</span>, then <span className="font-medium">Add to Home Screen</span>.
              </div>
              <div className="mt-2 flex items-center justify-end">
                <button
                  onClick={() => {
                    setHideForDays(IOS_HIDE_UNTIL_KEY, 30)
                    setIosPopoverOpen(false)
                  }}
                  className="rounded-md px-2 py-1 text-xs bg-gray-900 text-white hover:bg-gray-800"
                >
                  Got it
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
