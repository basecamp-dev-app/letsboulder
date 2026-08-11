import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useImageNavigation } from '@/features/image-first/hooks/use-image-navigation'

const mocks = vi.hoisted(() => ({
  scrollTo: vi.fn(),
  selectedScrollSnap: vi.fn(() => 0),
  on: vi.fn(),
  off: vi.fn(),
}))

vi.mock('embla-carousel-react', () => ({
  default: () => [vi.fn(), mocks],
}))

function NavigationHarness({ selectedImageId }: { selectedImageId: string }) {
  const navigation = useImageNavigation({
    orderedImageIds: ['image-1', 'image-2'],
    startIndex: 0,
    selectedImageId,
    onActiveImageIndexChange: vi.fn(),
    linkedImageIdByDisplayId: {},
    stacks: [],
    sectorMarkers: {},
  })

  return <output data-testid="active-image">{navigation.activeImageId}</output>
}

describe('useImageNavigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.selectedScrollSnap.mockReturnValue(0)
  })

  it('synchronizes the carousel when browser history changes the selected image', async () => {
    const view = render(<NavigationHarness selectedImageId="image-1" />)

    expect(screen.getByTestId('active-image')).toHaveTextContent('image-1')
    expect(mocks.scrollTo).not.toHaveBeenCalled()

    view.rerender(<NavigationHarness selectedImageId="image-2" />)

    expect(screen.getByTestId('active-image')).toHaveTextContent('image-2')
    await waitFor(() => expect(mocks.scrollTo).toHaveBeenCalledWith(1, true))
  })
})
