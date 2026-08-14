import { describe, expect, it } from 'vitest'

import { serializeJsonLd } from '@/lib/json-ld'

describe('serializeJsonLd', () => {
  it('escapes HTML-sensitive characters and Unicode separators without changing the value', () => {
    const data = {
      value: '</script><script>alert("xss")</script> & > "quoted"\u2028line\u2029paragraph',
    }

    const serialized = serializeJsonLd(data)

    expect(serialized).not.toMatch(/<\/?script/i)
    expect(serialized).not.toContain('<')
    expect(serialized).not.toContain('>')
    expect(serialized).not.toContain('&')
    expect(serialized).not.toContain('\u2028')
    expect(serialized).not.toContain('\u2029')
    expect(JSON.parse(serialized)).toEqual(data)
  })

  it('rejects values that JSON.stringify cannot serialize at the top level', () => {
    expect(() => serializeJsonLd(undefined)).toThrow(TypeError)
  })
})
