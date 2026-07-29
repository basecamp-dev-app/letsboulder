'use client'

import { createContext, useContext } from 'react'

import type { ContributionIntent, OpenDataConsentContextValue } from '@/features/legal/types/open-data-consent'

async function continueToBackend(intent: ContributionIntent) {
  await intent()
}

export const OpenDataConsentContext = createContext<OpenDataConsentContextValue>({ requireConsent: continueToBackend })

export function useOpenDataConsent() {
  return useContext(OpenDataConsentContext)
}
