// @vitest-environment jsdom
/* eslint-disable @next/next/no-img-element */

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ManagedCragImages from '@/features/crag-management/components/ManagedCragImages'
import { removeCragImageAction } from '@/features/crag-management/actions/remove-crag-image'
import type { ManagedCragImage } from '@/features/crag-management/types/managed-crag-image'

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}))

vi.mock('@/features/crag-management/actions/remove-crag-image', () => ({
  removeCragImageAction: vi.fn(),
}))

const canonicalImage: ManagedCragImage = {
  imageId: '11111111-1111-4111-8111-111111111111',
  cragImageId: null,
  sourceKind: 'canonical',
  previewUrl: 'https://example.test/canonical.jpg',
  status: 'approved',
  visibility: 'public',
  processingStatus: 'ready',
  moderationStatus: 'skipped',
  routeCount: 2,
  routesWithoutAlternativeImage: 1,
  routeNames: ['First route', 'Second route'],
  createdAt: '2026-08-24T12:00:00Z',
  canRemove: true,
}

const legacyImage: ManagedCragImage = {
  imageId: null,
  cragImageId: '22222222-2222-4222-8222-222222222222',
  sourceKind: 'legacy',
  previewUrl: 'https://example.test/legacy.jpg',
  status: 'legacy',
  visibility: 'unknown',
  processingStatus: 'unknown',
  moderationStatus: null,
  routeCount: 0,
  routesWithoutAlternativeImage: 0,
  routeNames: [],
  createdAt: '2026-08-23T12:00:00Z',
  canRemove: false,
}

function renderGallery(images: ManagedCragImage[] = [canonicalImage]) {
  return render(
    <ManagedCragImages
      countryCode="GB"
      cragId="33333333-3333-4333-8333-333333333333"
      cragSlug="test-crag"
      initialImages={images}
      isAdmin
    />,
  )
}

describe('ManagedCragImages', () => {
  beforeEach(() => {
    vi.mocked(removeCragImageAction).mockReset()
  })

  it('renders the responsive image grid and accessible removal dialog', async () => {
    const user = userEvent.setup()
    const { container } = renderGallery()

    expect(container.querySelector('.grid')?.className).toContain('sm:grid-cols-2')
    expect(screen.getByText('First route')).toBeTruthy()
    expect(screen.getByText(/1 route has no other active image/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /view public image/i }).getAttribute('href'))
      .toBe('/gb/test-crag/i/11111111-1111-4111-8111-111111111111')

    await user.click(screen.getByRole('button', { name: /image actions/i }))
    await user.click(screen.getByRole('menuitem', { name: /remove from crag/i }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Remove image from crag?' })).toBeTruthy()
    expect(screen.getByText(/routes and edit history will be preserved/i)).toBeTruthy()
    expect(screen.getByLabelText('Deletion reason')).toBeTruthy()
  })

  it('keeps the card while pending and after an action error', async () => {
    let resolveAction!: (value: { success: false; error: string; status: number }) => void
    vi.mocked(removeCragImageAction).mockImplementation(() => new Promise((resolve) => { resolveAction = resolve }))
    const user = userEvent.setup()
    renderGallery()

    await user.click(screen.getByRole('button', { name: /image actions/i }))
    await user.click(screen.getByRole('menuitem', { name: /remove from crag/i }))
    await user.type(screen.getByLabelText('Deletion reason'), 'Duplicate image')
    await user.click(screen.getByRole('button', { name: 'Remove image' }))

    expect(screen.getByText('First route')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Removing…' })).toBeTruthy()
    resolveAction({ success: false, error: 'Image does not belong to this crag', status: 400 })

    expect(await screen.findByRole('alert')).toHaveTextContent('Image does not belong to this crag')
    expect(screen.getByText('First route')).toBeTruthy()
  })

  it('removes the card only after server success and shows a success toast', async () => {
    vi.mocked(removeCragImageAction).mockResolvedValue({
      success: true,
      data: { imageId: canonicalImage.imageId as string },
    })
    const user = userEvent.setup()
    renderGallery()

    await user.click(screen.getByRole('button', { name: /image actions/i }))
    await user.click(screen.getByRole('menuitem', { name: /remove from crag/i }))
    fireEvent.change(screen.getByLabelText('Deletion reason'), { target: { value: 'Duplicate image' } })
    await user.click(screen.getByRole('button', { name: 'Remove image' }))

    await waitFor(() => expect(screen.queryByText('First route')).toBeNull())
    expect(screen.getByText('Image removed from the public crag')).toBeTruthy()
    expect(removeCragImageAction).toHaveBeenCalledWith({
      cragId: '33333333-3333-4333-8333-333333333333',
      imageId: canonicalImage.imageId,
      reason: 'Duplicate image',
    })
  })

  it('never sends a legacy crag image ID to canonical deletion', () => {
    renderGallery([legacyImage])

    expect(screen.getByText('Legacy image')).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Migration required' })).toBeDisabled()
    expect(removeCragImageAction).not.toHaveBeenCalled()
  })

  it('shows an already-deleted image without offering another mutation', () => {
    renderGallery([{ ...canonicalImage, status: 'deleted', visibility: 'private', canRemove: false }])

    expect(screen.getByText('deleted')).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Already deleted' })).toBeDisabled()
    expect(removeCragImageAction).not.toHaveBeenCalled()
  })

  it('renders new server images when client-side pagination changes the props', () => {
    const firstPageImage = { ...canonicalImage, routeNames: ['Lil Pop'], routeCount: 1 }
    const secondPageImage = {
      ...canonicalImage,
      imageId: '44444444-4444-4444-8444-444444444444',
      routeNames: ['Far Far Away'],
      routeCount: 1,
    }
    const view = renderGallery([firstPageImage])

    expect(screen.getByText('Lil Pop')).toBeTruthy()
    view.rerender(
      <ManagedCragImages
        countryCode="GB"
        cragId="33333333-3333-4333-8333-333333333333"
        cragSlug="test-crag"
        initialImages={[secondPageImage]}
        isAdmin
      />,
    )

    expect(screen.queryByText('Lil Pop')).toBeNull()
    expect(screen.getByText('Far Far Away')).toBeTruthy()
  })
})
