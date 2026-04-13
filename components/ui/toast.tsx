'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import type { AppToast } from '@/hooks/use-toast'

interface ToastProps {
  message: string
  type?: AppToast['type']
  onClose?: () => void
}

export function Toast({ message, type = 'info', onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose?.()
    }, 3000)
    return () => clearTimeout(timer)
  }, [onClose])

  const styles = {
    success: 'bg-green-50 text-green-900 border-green-200 dark:bg-green-900/20 dark:text-green-100 dark:border-green-800',
    error: 'bg-red-50 text-red-900 border-red-200 dark:bg-red-900/20 dark:text-red-100 dark:border-red-800',
    info: 'bg-gray-50 text-gray-900 border-gray-200 dark:bg-gray-800/50 dark:text-gray-100 dark:border-gray-700',
  }
  const announcementProps = type === 'error'
    ? { role: 'alert' as const, 'aria-live': 'assertive' as const }
    : { role: 'status' as const, 'aria-live': 'polite' as const }

  return (
    <div
      aria-atomic="true"
      className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 shadow-lg ${styles[type]} animate-in slide-in-from-top-2`}
      {...announcementProps}
    >
      <span className="text-sm font-medium">{message}</span>
      <button aria-label="Dismiss notification" onClick={onClose} className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/10">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

interface ToastContainerProps {
  toasts: AppToast[]
  onRemove: (id: string) => void
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div className="fixed left-1/2 top-[calc(var(--app-header-offset)+env(safe-area-inset-top,0px)+1rem)] z-[4500] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 space-y-2">
      {toasts.map((toast) => (
        <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => onRemove(toast.id)} />
      ))}
    </div>
  )
}
