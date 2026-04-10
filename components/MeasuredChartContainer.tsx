'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

interface MeasuredChartContainerProps {
  className: string
  minHeightClassName?: string
  fallback?: ReactNode
  children: ReactNode
}

export default function MeasuredChartContainer({
  className,
  minHeightClassName,
  fallback = null,
  children,
}: MeasuredChartContainerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const updateReadiness = () => {
      setIsReady(element.clientWidth > 0 && element.clientHeight > 0)
    }

    updateReadiness()

    const observer = new ResizeObserver(() => {
      updateReadiness()
    })

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [])

  return (
    <div ref={containerRef} className={className}>
      {isReady ? children : <div className={minHeightClassName}>{fallback}</div>}
    </div>
  )
}
