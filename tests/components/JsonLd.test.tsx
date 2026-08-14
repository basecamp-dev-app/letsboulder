import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import JsonLd from '@/components/JsonLd'

describe('JsonLd', () => {
  it('keeps a closing-script payload inside a single non-executable JSON-LD element', () => {
    const data = {
      name: '</script><script data-injected="true">alert("xss")</script>',
      description: 'quotes " and ampersand & with separators \u2028 \u2029',
    }
    const container = document.createElement('div')

    container.innerHTML = renderToStaticMarkup(<JsonLd data={data} />)

    const scripts = container.querySelectorAll('script')
    expect(scripts).toHaveLength(1)
    expect(container.querySelector('[data-injected="true"]')).toBeNull()
    expect(scripts[0].type).toBe('application/ld+json')
    expect(JSON.parse(scripts[0].textContent ?? '')).toEqual(data)
  })
})
