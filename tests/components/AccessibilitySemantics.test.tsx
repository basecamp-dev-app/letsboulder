import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ImpactCard } from '@/components/metrics/ImpactCard'

describe('accessibility semantics', () => {
  it('groups an impact metric name, value, and description as definition data', () => {
    render(
      <dl>
        <ImpactCard
          title="Routes Documented"
          value={1234}
          description="Published routes currently in the guide"
        />
      </dl>,
    )

    const list = screen.getByRole('term').closest('dl')
    expect(list).not.toBeNull()
    expect(screen.getByRole('term')).toHaveTextContent('Routes Documented')
    const definitions = within(list as HTMLElement).getAllByRole('definition')
    expect(definitions).toHaveLength(2)
    expect(definitions[0]).toHaveTextContent('1,234')
    expect(definitions[1]).toHaveTextContent('Published routes currently in the guide')
  })

  it('does not present a failed impact metric as zero', () => {
    render(
      <dl>
        <ImpactCard title="Routes Documented" value={null} />
      </dl>,
    )

    expect(screen.getByText('Temporarily unavailable')).toBeVisible()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })
})
