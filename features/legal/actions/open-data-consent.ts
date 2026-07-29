'use server'

import { getActionAuth } from '@/lib/actions/action-auth'
import type { ActionResult } from '@/lib/actions/action-result'
import { getServerClient } from '@/lib/supabase-server'
import type { OpenDataConsentStatus } from '@/features/legal/types/open-data-consent'

export async function getOpenDataConsentStatusAction(): Promise<ActionResult<OpenDataConsentStatus>> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }

  const supabase = await getServerClient()
  const { data, error } = await supabase.rpc('get_open_data_consent_status')
  const status = data?.[0]
  if (error || !status) return { success: false, error: 'Could not check contribution terms', status: 500 }

  return {
    success: true,
    data: {
      requiredVersion: status.required_version,
      acceptedVersion: status.accepted_version,
      consentTimestamp: status.consent_timestamp,
      isValid: status.is_valid,
    },
  }
}

export async function acceptOpenDataConsentAction(expectedVersion: string): Promise<ActionResult<OpenDataConsentStatus>> {
  const auth = await getActionAuth()
  if (!auth.success) return { success: false, error: auth.error, status: auth.status }

  const supabase = await getServerClient()
  const { error } = await supabase.rpc('accept_open_data_consent', { p_expected_version: expectedVersion })
  if (error?.details === 'consent_version_changed') return { success: false, error: 'The contribution terms changed. Please review the current version.', status: 409 }
  if (error) return { success: false, error: 'Could not record your agreement', status: 500 }

  return getOpenDataConsentStatusAction()
}
