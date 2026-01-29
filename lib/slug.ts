export function slugify(input: string): string {
  const s = (input || '').trim().toLowerCase()
  const replaced = s
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
  return replaced
}

export function makeUniqueSlug(base: string, used: Set<string>): string {
  const normalizedBase = slugify(base) || 'route'
  if (!used.has(normalizedBase)) {
    used.add(normalizedBase)
    return normalizedBase
  }

  for (let i = 2; i <= 1000; i++) {
    const candidate = `${normalizedBase}-${i}`
    if (!used.has(candidate)) {
      used.add(candidate)
      return candidate
    }
  }

  const fallback = `${normalizedBase}-${Date.now()}`
  used.add(fallback)
  return fallback
}
