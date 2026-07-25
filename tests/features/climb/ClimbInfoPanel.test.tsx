// @vitest-environment jsdom

import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
    attribution: {
      ownerRoleLabel: 'Original Uploader',
      ownerDisplayLabel: 'Anonymous Contributor',
      ownerProfileId: null,
      formattedContributionHandle: null,
      contributionCreditUrl: null,
      communityEditorsRoleLabel: 'Community Editors',
      communityEditorsCount: 0,
    },
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
    loggingOnline: true,
    savingWantToTry: false,
    loadingSelectedClimbState: false,
    userPresent: true,
    isWantToTrySaved: false,
    gradeSystem: 'font_scale',
    gradeOpinionLabels: { soft: 'Soft', agree: 'Agree', hard: 'Hard' },
    formatRouteTypeLabel: (value: string) => value,
    onOpenOffline: vi.fn(),
    onEditRoute: vi.fn(),
    onAddRoutes,
    onOpenFlag: vi.fn(),
    onShare: vi.fn(),
    onGoToAuth: vi.fn(),
    onToggleWantToTry: vi.fn(),
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
  afterEach(() => {
    cleanup()
  })

  it('shows route-less empty state copy and add routes CTA', async () => {
    const user = userEvent.setup()
    const { onAddRoutes } = renderPanel()

    expect(screen.getByText('This photo needs routes')).toBeTruthy()
    expect(screen.getByText('Know this wall? Trace the first line and add route details.')).toBeTruthy()
    expect(screen.getByText('No routes have been added to this image yet.')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Add the first route' }))
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

  it('hides the offline CTA when offline packs are unavailable', () => {
    renderPanel({
      offlinePackAvailable: false,
    })

    expect(screen.queryByRole('button', { name: 'Save offline' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Saved offline' })).toBeNull()
  })

  it('shows the offline CTA when offline packs are available', () => {
    renderPanel({
      offlinePackAvailable: true,
    })

    expect(screen.getByRole('button', { name: 'Save offline' })).toBeTruthy()
  })

  it('renders named uploader and contributor count when present', () => {
    renderPanel({
      attribution: {
        ownerRoleLabel: 'Original Uploader',
        ownerDisplayLabel: 'Maya Stone',
        ownerProfileId: 'user-1',
        formattedContributionHandle: '@maya_beta',
        contributionCreditUrl: 'https://instagram.com/maya_beta',
        communityEditorsRoleLabel: 'Community Editors',
        communityEditorsCount: 3,
      },
    })

    expect(screen.getAllByText('Original Uploader').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: 'Maya Stone' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '@maya_beta' })).toBeTruthy()
    expect(screen.getByText('Community Editors')).toBeTruthy()
    expect(screen.getByText('Refined by 3 contributors')).toBeTruthy()
  })

  it('renders anonymous uploader label and hides community editors row at zero', () => {
    renderPanel({
      attribution: {
        ownerRoleLabel: 'Original Uploader',
        ownerDisplayLabel: 'Anonymous Contributor',
        ownerProfileId: null,
        formattedContributionHandle: null,
        contributionCreditUrl: null,
        communityEditorsRoleLabel: 'Community Editors',
        communityEditorsCount: 0,
      },
    })

    expect(screen.getAllByText((_, node) => node?.textContent === 'Uploaded by Anonymous Contributor').length).toBeGreaterThan(0)
    expect(screen.queryByText('Community Editors')).toBeNull()
  })

  it('shows Want to try for unsigned saved state and Saved once toggled', () => {
    const { rerender } = render(React.createElement(ClimbInfoPanel, {
      selectedClimb: {
        id: 'climb-1',
        name: 'Pebble Wrestle',
        grade: '6B',
        route_type: 'boulder',
        description: null,
      },
      selectedRouteExists: true,
      canEditRoute: false,
      canAddRoutes: false,
      totalRoutesCombined: 1,
      totalFaces: 1,
      isFacesLoading: false,
      cragPath: '/gb/test-crag',
      isOfflineSaved: false,
      offlinePackAvailable: false,
      attribution: {
        ownerRoleLabel: 'Original Uploader',
        ownerDisplayLabel: 'Anonymous Contributor',
        ownerProfileId: null,
        formattedContributionHandle: null,
        contributionCreditUrl: null,
        communityEditorsRoleLabel: 'Community Editors',
        communityEditorsCount: 0,
      },
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
      loggingOnline: true,
      savingWantToTry: false,
      loadingSelectedClimbState: false,
      userPresent: true,
      isWantToTrySaved: false,
      gradeSystem: 'font_scale',
      gradeOpinionLabels: { soft: 'Soft', agree: 'Agree', hard: 'Hard' },
      formatRouteTypeLabel: (value: string) => value,
      onOpenOffline: vi.fn(),
      onEditRoute: vi.fn(),
      onAddRoutes: vi.fn(),
      onOpenFlag: vi.fn(),
      onShare: vi.fn(),
      onGoToAuth: vi.fn(),
      onToggleWantToTry: vi.fn(),
      onLog: vi.fn(),
      onSetFeedbackCollapsed: vi.fn(),
      onSetPendingGradeOpinion: vi.fn(),
      onSetPendingStarRating: vi.fn(),
      onToggleCommunityNotesExpanded: vi.fn(),
      onSaveFeedback: vi.fn(),
      onGoToLogbook: vi.fn(),
      deferredSections: null,
    }))

    expect(screen.getByRole('button', { name: 'Want to try' })).toBeTruthy()

    rerender(React.createElement(ClimbInfoPanel, {
      selectedClimb: {
        id: 'climb-1',
        name: 'Pebble Wrestle',
        grade: '6B',
        route_type: 'boulder',
        description: null,
      },
      selectedRouteExists: true,
      canEditRoute: false,
      canAddRoutes: false,
      totalRoutesCombined: 1,
      totalFaces: 1,
      isFacesLoading: false,
      cragPath: '/gb/test-crag',
      isOfflineSaved: false,
      offlinePackAvailable: false,
      attribution: {
        ownerRoleLabel: 'Original Uploader',
        ownerDisplayLabel: 'Anonymous Contributor',
        ownerProfileId: null,
        formattedContributionHandle: null,
        contributionCreditUrl: null,
        communityEditorsRoleLabel: 'Community Editors',
        communityEditorsCount: 0,
      },
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
      loggingOnline: true,
      savingWantToTry: false,
      loadingSelectedClimbState: false,
      userPresent: true,
      isWantToTrySaved: true,
      gradeSystem: 'font_scale',
      gradeOpinionLabels: { soft: 'Soft', agree: 'Agree', hard: 'Hard' },
      formatRouteTypeLabel: (value: string) => value,
      onOpenOffline: vi.fn(),
      onEditRoute: vi.fn(),
      onAddRoutes: vi.fn(),
      onOpenFlag: vi.fn(),
      onShare: vi.fn(),
      onGoToAuth: vi.fn(),
      onToggleWantToTry: vi.fn(),
      onLog: vi.fn(),
      onSetFeedbackCollapsed: vi.fn(),
      onSetPendingGradeOpinion: vi.fn(),
      onSetPendingStarRating: vi.fn(),
      onToggleCommunityNotesExpanded: vi.fn(),
      onSaveFeedback: vi.fn(),
      onGoToLogbook: vi.fn(),
      deferredSections: null,
    }))

    expect(screen.getByRole('button', { name: 'Saved' })).toBeTruthy()
  })

  it('shows loading state and disables route-bound actions while climb state loads', () => {
    renderPanel({
      selectedClimb: {
        id: 'climb-1',
        name: 'Pebble Wrestle',
        grade: '6B',
        route_type: 'boulder',
        description: null,
      },
      selectedRouteExists: true,
      canAddRoutes: false,
      loadingSelectedClimbState: true,
    })

    expect(screen.getByRole('status')).toHaveTextContent('Loading climb state...')
    expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Flash' })).toBeNull()
  })

  it('places sticky logging controls before route details and logs each ascent style', async () => {
    const user = userEvent.setup()
    const onLog = vi.fn()
    renderPanel({
      selectedClimb: {
        id: 'climb-1',
        name: 'Pebble Wrestle',
        grade: '6B',
        route_type: 'boulder',
        description: 'Start low and move left.',
      },
      selectedRouteExists: true,
      canAddRoutes: false,
      totalRoutesCombined: 1,
      onLog,
    })

    const flashButton = screen.getByRole('button', { name: 'Flash' })
    const routeCount = screen.getByText('1 route')
    expect(flashButton.compareDocumentPosition(routeCount) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(flashButton.parentElement?.parentElement).toHaveClass('sticky')

    await user.click(flashButton)
    await user.click(screen.getByRole('button', { name: 'Send' }))
    await user.click(screen.getByRole('button', { name: 'Try' }))
    expect(onLog.mock.calls).toEqual([['flash'], ['top'], ['try']])
  })

  it('disables logging controls and explains when logging is offline', () => {
    renderPanel({
      selectedClimb: {
        id: 'climb-1',
        name: 'Pebble Wrestle',
        grade: '6B',
        route_type: 'boulder',
        description: null,
      },
      selectedRouteExists: true,
      canAddRoutes: false,
      loggingOnline: false,
    })

    expect(screen.getByText('Logging requires a connection.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Flash' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Try' })).toBeDisabled()
  })
})
