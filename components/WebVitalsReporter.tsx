'use client'

import { useReportWebVitals } from 'next/web-vitals'

type MetricName = 'CLS' | 'INP' | 'LCP' | 'TTFB'

function getRating(name: MetricName, value: number): 'good' | 'needs-improvement' | 'poor' {
  if (name === 'CLS') return value <= 0.1 ? 'good' : value <= 0.25 ? 'needs-improvement' : 'poor'
  if (name === 'INP') return value <= 200 ? 'good' : value <= 500 ? 'needs-improvement' : 'poor'
  if (name === 'LCP') return value <= 2500 ? 'good' : value <= 4000 ? 'needs-improvement' : 'poor'
  return value <= 800 ? 'good' : value <= 1800 ? 'needs-improvement' : 'poor'
}

export default function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (metric.name !== 'CLS' && metric.name !== 'INP' && metric.name !== 'LCP' && metric.name !== 'TTFB') {
      return
    }

    console.log('[perf]', {
      source: 'web-vitals',
      metric: metric.name,
      pathname: window.location.pathname,
      value: metric.value,
      rating: getRating(metric.name, metric.value),
      attribution: 'attribution' in metric ? metric.attribution : undefined,
    })
  })

  return null
}
