import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { RouteEditSidebar } from '@/features/route-editor/components/RouteEditSidebar'

const mockUpdateEditorDraft = vi.fn()

const routeStoreState = {
  routes: [],
  selectedRouteId: null as string | null,
  routeEditorDraft: {
    routeId: null,
    name: 'Test route',
    grade: '6A',
    climbType: 'boulder',
    description: '',
  },
  editorIntent: null,
  deleteRoute: vi.fn(),
  setEditorDraft: vi.fn(),
  updateEditorDraft: mockUpdateEditorDraft,
  setEditorIntent: vi.fn(),
  setEditorPanelOpen: vi.fn(),
  setSelectedRoute: vi.fn(),
}

vi.mock('@/features/route-editor/store', () => ({
  useRouteStore: <T,>(selector: (state: typeof routeStoreState) => T) => selector(routeStoreState),
}))

vi.mock('@/features/grades/hooks/useGradeSystem', () => ({
  useGradePreferences: () => ({ boulder: 'font_scale', route: 'yds_equivalent', trad: 'british_equivalent' }),
  getGradeSystemForClimbType: (climbType: string) => climbType === 'boulder' ? 'font_scale' : 'yds_equivalent',
}))

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/features/grades/components/GradePicker', () => ({
  default: () => null,
}))

afterEach(() => {
  vi.useRealTimers()
})

describe('RouteEditSidebar', () => {
  it('renders Type before Grade and preserves the canonical grade when Type changes', () => {
    render(<RouteEditSidebar />)
    const typeSelect = screen.getByLabelText('Type')
    const gradeButton = screen.getByLabelText('Grade')

    expect(typeSelect.compareDocumentPosition(gradeButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.change(typeSelect, { target: { value: 'sport' } })

    expect(mockUpdateEditorDraft).toHaveBeenCalledWith({ climbType: 'sport' })
    expect(mockUpdateEditorDraft).not.toHaveBeenCalledWith(expect.objectContaining({ grade: expect.anything() }))
    expect(screen.getByRole('status')).toHaveTextContent('Grade unchanged. Now shown in YDS.')
  })

  it('dismisses grade display feedback after three seconds', () => {
    vi.useFakeTimers()
    render(<RouteEditSidebar />)

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'sport' } })
    expect(screen.getByRole('status')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(3000))

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('sends metadata edits to the editor owner', () => {
    const onRouteMetadataChange = vi.fn()
    routeStoreState.selectedRouteId = 'route-1'
    render(<RouteEditSidebar onRouteMetadataChange={onRouteMetadataChange} />)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Owner name' } })

    expect(onRouteMetadataChange).toHaveBeenCalledWith('route-1', { name: 'Owner name' })
    routeStoreState.selectedRouteId = null
  })
})
