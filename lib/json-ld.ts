const JSON_LD_ESCAPE_PATTERN = /[<>&\u2028\u2029]/g

const JSON_LD_ESCAPES: Record<string, string> = {
  '<': '\\u003C',
  '>': '\\u003E',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
}

export function serializeJsonLd(data: unknown): string {
  const json = JSON.stringify(data)

  if (json === undefined) {
    throw new TypeError('JSON-LD data must be JSON-serializable')
  }

  return json.replace(JSON_LD_ESCAPE_PATTERN, (character) => JSON_LD_ESCAPES[character])
}
