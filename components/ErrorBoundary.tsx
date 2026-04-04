'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Button } from '@/components/ui/button'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onReset?: () => void
  name?: string
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorId: string
}

function generateErrorId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, errorId: generateErrorId() }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, errorId: generateErrorId() }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const componentName = this.props.name ?? 'UnknownComponent'
    Sentry.captureException(error, {
      tags: { error_id: this.state.errorId, location: `error-boundary:${componentName}` },
      contexts: {
        react: {
          componentStack: errorInfo.componentStack,
        },
      },
    })
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorId: generateErrorId() })
    this.props.onReset?.()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center">
          <h3 className="text-sm font-semibold">Something went wrong</h3>
          <p className="text-xs text-muted-foreground">
            Error ID:{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
              {this.state.errorId}
            </code>
          </p>
          <Button size="sm" onClick={this.handleReset}>
            Try again
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
