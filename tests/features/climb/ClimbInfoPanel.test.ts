// @vitest-environment jsdom

import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ClimbInfoPanel from '@/features/climb/components/ClimbInfoPanel'

function renderPanel(overrides: Partial<React.ComponentProps<typeof ClimbInfoPanel>> = {}) {
  const onAddRoutes = vi.fn()

  render(React.createElement(ClimbInfoPanel, {
    selectedClimb: null,
    selectedRouteExists: false,
    canEditRoute: false,
    canAddRoutes: true,
    totalRoutesCombined: 0,
    totalFaces: 1,
    isFacesLoading: false,
    cragPath: '/gb/test-crag',
    isOfflineSaved: false,
    offlinePackAvailable: false,
    publicSubmitter: null,
    formattedContributionHandle: null,
    contributionCreditUrl: null,
    imageLatitude: null,
    imageLongitude: null,
    selectedClimbLogged: false,
    selectedClimbLog: null,
    selectedClimbHasSavedFeedback: false,
    selectedClimbFeedbackCollapsed: true,
    selectedClimbRatingSummary: null,
    selectedClimbAverageRating: null,
    selectedClimbRoundedStars: 0,
    pendingGradeOpinion: null,
    pendingStarRating: null,
    communityNotesCount: 0,
    communityNotes: [],
    communityNotesExpanded: false,
    savingFeedback: false,
    logging: false,
    userPresent: true,
    gradeSystem: 'font_scale',
    gradeOpinionLabels: { soft: 'Soft', agree: 'Agree', hard: 'Hard' },
    formatRouteTypeLabel: (value: string) => value,
    onOpenOffline: vi.fn(),
    onEditRoute: vi.fn(),
    onAddRoutes,
    onOpenFlag: vi.fn(),
    onShare: vi.fn(),
    onGoToAuth: vi.fn(),
    onLog: vi.fn(),
    onSetFeedbackCollapsed: vi.fn(),
    onSetPendingGradeOpinion: vi.fn(),
    onSetPendingStarRating: vi.fn(),
    onToggleCommunityNotesExpanded: vi.fn(),
    onSaveFeedback: vi.fn(),
    onGoToLogbook: vi.fn(),
    deferredSections: null,
    ...overrides,
  }))

  return { onAddRoutes }
}

describe('ClimbInfoPanel', () => {
  it('shows route-less empty state copy and add routes CTA', async () => {
    const user = userEvent.setup()
    const { onAddRoutes } = renderPanel()

    expect(screen.getByText('No routes added yet')).toBeTruthy()
    expect(screen.getByText('Open the editor to add the first topo lines for this image')).toBeTruthy()
    expect(screen.getByText('No routes have been added to this image yet')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Add routes to this image' }))
    expect(onAddRoutes).toHaveBeenCalledTimes(1)
  })

  it('keeps sign-in CTA for selected routes when the user is signed out', () => {
    renderPanel({
      selectedRouteExists: true,
      totalRoutesCombined: 1,
      userPresent: false,
      canAddRoutes: false,
    })

    expect(screen.getByRole('button', { name: 'Sign in to Log This Climb' })).toBeTruthy()
  })
})
