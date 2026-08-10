'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface SearchResult {
  id: string
  name: string
  href: string
  source: 'live'
  detail: string | null
}

interface RemoteCragResult {
  id: string
  name: string
  slug: string | null
  countryCode: string | null
  regionName?: string | null
  subArea?: string | null
}

function buildCragHref(input: { id: string; slug: string | null; countryCode: string | null }) {
  if (input.slug && input.countryCode) {
    return `/${input.countryCode.toLowerCase()}/${input.slug}`
  }
  return `/crag/${input.id}`
}

export default function WeakSignalSearchSheet() {
  const [query, setQuery] = useState('')
  const [remoteResults, setRemoteResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setRemoteResults([])
      setIsSearching(false)
      setError(null)
      return
    }

    const controller = new AbortController()
    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true)
      setError(null)
      try {
        const response = await fetch(`/api/crags/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error('Search unavailable')
        }
        const payload = await response.json() as RemoteCragResult[]
        setRemoteResults(payload.map((item) => ({
          id: `live:${item.id}`,
          name: item.name,
          href: buildCragHref({ id: item.id, slug: item.slug, countryCode: item.countryCode }),
          source: 'live',
          detail: item.subArea || item.regionName || null,
        })))
      } catch (searchError) {
        if (controller.signal.aborted) return
        setRemoteResults([])
        setError(searchError instanceof Error ? searchError.message : 'Search unavailable right now')
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false)
        }
      }
    }, 500)

    return () => {
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [query])

  const mergedResults = useMemo(() => remoteResults.slice(0, 8), [remoteResults])

  return (
    <div className="rounded-3xl border border-white/12 bg-black/35 p-5 shadow-2xl shadow-black/25 backdrop-blur-md">
      <div className="flex items-center gap-3 text-white">
        <div className="rounded-full bg-white/10 p-2">
          <Search className="size-4" />
        </div>
        <div>
          <p className="text-sm font-semibold">Search for a crag</p>
          <p className="text-xs text-white/70">Search live crags when the network is reachable.</p>
        </div>
      </div>

      <div className="mt-4">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search crags"
          className="border-white/15 bg-white/10 text-white placeholder:text-white/50"
        />
      </div>

      <div className="mt-4 space-y-2">
        {mergedResults.map((result) => (
          <button
            key={result.id}
            type="button"
            onClick={() => window.location.assign(result.href)}
            className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-left transition hover:bg-white/10"
          >
            <div>
              <p className="text-sm font-medium text-white">{result.name}</p>
              {result.detail ? <p className="text-xs text-white/65">{result.detail}</p> : null}
            </div>
            <span className="rounded-full bg-cyan-500/20 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-cyan-200">
              Live
            </span>
          </button>
        ))}

        {isSearching ? (
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-white/75">
            <Loader2 className="size-4 animate-spin" />
            Searching live crags...
          </div>
        ) : null}

        {!isSearching && error ? (
          <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {error}
          </div>
        ) : null}

        {!isSearching && mergedResults.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-white/65">
            {query.trim().length >= 2 ? 'No matching crags yet.' : 'Start typing to search live crags.'}
          </div>
        ) : null}
      </div>
    </div>
  )
}
