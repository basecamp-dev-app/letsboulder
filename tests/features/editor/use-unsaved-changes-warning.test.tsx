import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useUnsavedChangesWarning } from '@/features/editor/hooks/use-unsaved-changes-warning'

describe('useUnsavedChangesWarning', () => {
  it('prevents unloading only while changes are unsaved', () => {
    const { rerender, unmount } = renderHook(
      ({ isDirty }) => useUnsavedChangesWarning(isDirty),
      { initialProps: { isDirty: false } }
    )

    const cleanEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(cleanEvent)
    expect(cleanEvent.defaultPrevented).toBe(false)

    rerender({ isDirty: true })
    const dirtyEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirtyEvent)
    expect(dirtyEvent.defaultPrevented).toBe(true)

    unmount()
    const unmountedEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unmountedEvent)
    expect(unmountedEvent.defaultPrevented).toBe(false)
  })
})
