export interface OpenDataConsentStatus {
  requiredVersion: string
  acceptedVersion: string | null
  consentTimestamp: string | null
  isValid: boolean
}

export type ContributionIntent = () => void | Promise<void>

export interface OpenDataConsentContextValue {
  requireConsent: (intent: ContributionIntent) => Promise<void>
}
