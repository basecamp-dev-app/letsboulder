'use client'

import posthog from 'posthog-js'

const POSTHOG_INITIALIZED = typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_API_KEY

if (POSTHOG_INITIALIZED) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_API_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_INSTANCE_URL || 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: false,
  })
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return children
}

export const trackEvent = (
  event: string,
  properties?: Record<string, unknown>
) => {
  if (typeof window !== 'undefined') {
    posthog.capture(event, properties)
  }
}

export const trackRouteClicked = (routeId: string, routeName?: string) => {
  trackEvent('route_clicked', {
    route_id: routeId,
    route_name: routeName,
  })
}

export const trackClimbLogged = (
  climbId: string,
  climbName: string,
  grade: string,
  style: 'flash' | 'top' | 'try'
) => {
  trackEvent('climb_logged', {
    climb_id: climbId,
    climb_name: climbName,
    grade,
    style,
  })
}

export const trackSearchPerformed = (query: string, resultCount: number) => {
  trackEvent('search_performed', {
    query_length: query.length,
    result_count: resultCount,
  })
}

export const trackSearchResultClicked = (
  resultId: string,
  resultType: 'crag' | 'climb',
  resultName: string
) => {
  trackEvent('search_result_clicked', {
    result_id: resultId,
    result_type: resultType,
    result_name: resultName,
  })
}

export const trackUploadStarted = (mode: 'new' | 'existing') => {
  trackEvent('upload_started', {
    mode,
  })
}

export const trackUploadCompleted = (imageId: string, routeCount: number) => {
  trackEvent('upload_completed', {
    image_id: imageId,
    route_count: routeCount,
  })
}

export const trackRouteSubmitted = (routeCount: number) => {
  trackEvent('route_submitted', {
    route_count: routeCount,
  })
}

export const trackAuthLoginAttempted = (method: string) => {
  trackEvent('auth_login_attempted', {
    method,
  })
}

export const trackAuthLoginSuccess = (method: string) => {
  trackEvent('auth_login_success', {
    method,
  })
}

export const setUserProperties = (
  properties: Record<string, unknown>
) => {
  if (typeof window !== 'undefined') {
    posthog.setPersonProperties(properties)
  }
}

export const identifyUser = (userId: string, properties?: Record<string, unknown>) => {
  if (typeof window !== 'undefined') {
    posthog.identify(userId, properties)
  }
}

export const resetPostHog = () => {
  if (typeof window !== 'undefined') {
    posthog.reset()
  }
}
