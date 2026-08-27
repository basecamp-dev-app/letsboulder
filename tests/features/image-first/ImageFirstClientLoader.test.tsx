import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import ImageFirstClientLoader from '@/features/image-first/components/ImageFirstClientLoader'
import type { ImageFirstPayload } from '@/features/image-first/types'

vi.mock('@/features/image-first/components/ImageFirstClient', () => ({
  default: () => <main data-testid="image-first-client">Route viewer</main>,
}))

describe('ImageFirstClientLoader', () => {
  test('keeps the route skeleton visible and the server shell hidden until the client is ready', async () => {
    const { container } = render(
      <>
        <ImageFirstClientLoader payload={{} as ImageFirstPayload} />
        <section data-image-first-server-shell="true">
          <h1>Flashing Route Name</h1>
        </section>
      </>
    )

    expect(container.querySelector('[data-image-first-client-loading="true"]')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-slot="skeleton"]')).not.toHaveLength(0)
    expect(container.querySelector('style')?.textContent).toContain('[data-image-first-server-shell="true"]{display:none}')
    expect(screen.getByText('Flashing Route Name')).not.toBeVisible()

    await waitFor(() => expect(screen.getByTestId('image-first-client')).toBeInTheDocument())

    expect(container.querySelector('[data-image-first-client-loading="true"]')).not.toBeInTheDocument()
    expect(container.querySelector('style')?.textContent).toContain('[data-image-first-server-shell="true"]{display:none}')
    expect(screen.getByText('Flashing Route Name')).not.toBeVisible()
  })
})
