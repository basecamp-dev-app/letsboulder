'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import type { NewRouteData } from '@/lib/submission-types'

export interface SubmitContextType {
  routes: NewRouteData[]
  setRoutes: (routes: NewRouteData[]) => void
  isSubmitting: boolean
  setIsSubmitting: (submitting: boolean) => void
  canSubmit: boolean
  doneDrawing: boolean
  setDoneDrawing: (done: boolean) => void
}

const SubmitContext = createContext<SubmitContextType | null>(null)

export function useSubmitContext() {
  const context = useContext(SubmitContext)
  if (!context) {
    return {
      routes: [],
      setRoutes: () => {},
      isSubmitting: false,
      setIsSubmitting: () => {},
      canSubmit: false,
      doneDrawing: false,
      setDoneDrawing: () => {},
    }
  }
  return context
}

export function SubmitProvider({ children }: { children: ReactNode }) {
  const [routes, setRoutes] = useState<NewRouteData[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [doneDrawing, setDoneDrawing] = useState(false)

  return (
    <SubmitContext.Provider
      value={{
        routes,
        setRoutes,
        isSubmitting,
        setIsSubmitting,
        canSubmit: routes.length > 0,
        doneDrawing,
        setDoneDrawing,
      }}
    >
      {children}
    </SubmitContext.Provider>
  )
}
