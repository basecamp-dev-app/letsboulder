'use client'

import { FormEvent, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { csrfFetch } from '@/hooks/useCsrf'

interface SessionComposerProps {
  placeId: string
}

const DISCIPLINE_OPTIONS = [
  { value: 'boulder', label: 'Boulder' },
  { value: 'sport', label: 'Sport' },
  { value: 'trad', label: 'Trad' },
  { value: 'top_rope', label: 'Top rope' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'deep_water_solo', label: 'Deep water solo' },
]

function toIsoDateTime(localValue: string): string | null {
  if (!localValue) return null
  const date = new Date(localValue)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function toIsoFromDateAndTime(dateValue: string, timeValue: string): string | null {
  if (!dateValue) return null
  const localValue = `${dateValue}T${timeValue || '18:00'}`
  return toIsoDateTime(localValue)
}

export default function SessionComposer({ placeId }: SessionComposerProps) {
  const router = useRouter()
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('18:00')
  const [endAt, setEndAt] = useState('')
  const [discipline, setDiscipline] = useState('')
  const [gradeMin, setGradeMin] = useState('')
  const [gradeMax, setGradeMax] = useState('')
  const [body, setBody] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = useMemo(() => {
    return startDate.trim().length > 0 && body.trim().length > 0 && !isSubmitting
  }, [body, isSubmitting, startDate])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const startIso = toIsoFromDateAndTime(startDate, startTime)
    const endIso = endAt ? toIsoDateTime(endAt) : null

    if (!startIso) {
      setError('Please provide a valid start time.')
      return
    }

    if (body.trim().length < 4) {
      setError('Please add a bit more detail to your session post.')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await csrfFetch('/api/community/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'session',
          place_id: placeId,
          start_at: startIso,
          end_at: endIso,
          discipline: discipline || null,
          grade_min: gradeMin.trim() || null,
          grade_max: gradeMax.trim() || null,
          body: body.trim(),
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({} as { error?: string }))
        setError(payload.error || 'Failed to create session post.')
        return
      }

      setBody('')
      setGradeMin('')
      setGradeMax('')
      setDiscipline('')
      setStartDate('')
      setStartTime('18:00')
      setEndAt('')
      router.refresh()
    } catch {
      setError('Could not publish your session right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Plan a session</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-gray-700 dark:text-gray-300">
          Start date
          <div className="mt-1 grid grid-cols-2 gap-2">
            <input
              required
              type="date"
              value={startDate}
              onChange={event => setStartDate(event.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
            />
            <input
              required
              type="time"
              value={startTime}
              onChange={event => setStartTime(event.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
            />
          </div>
          <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">Time defaults to 18:00. Adjust it if needed.</span>
        </label>
        <label className="text-sm text-gray-700 dark:text-gray-300">
          End (optional)
          <input
            type="datetime-local"
            value={endAt}
            onChange={event => setEndAt(event.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
          />
        </label>
        <label className="text-sm text-gray-700 dark:text-gray-300">
          Discipline
          <select
            value={discipline}
            onChange={event => setDiscipline(event.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
          >
            <option value="">Any</option>
            {DISCIPLINE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-gray-700 dark:text-gray-300">
            Grade min
            <input
              type="text"
              value={gradeMin}
              onChange={event => setGradeMin(event.target.value)}
              placeholder="6A"
              maxLength={10}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
            />
          </label>
          <label className="text-sm text-gray-700 dark:text-gray-300">
            Grade max
            <input
              type="text"
              value={gradeMax}
              onChange={event => setGradeMax(event.target.value)}
              placeholder="7A"
              maxLength={10}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
            />
          </label>
        </div>
      </div>
      <label className="mt-3 block text-sm text-gray-700 dark:text-gray-300">
        Notes
        <textarea
          required
          value={body}
          onChange={event => setBody(event.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="When are you climbing, and what kind of partner are you looking for?"
          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
        />
      </label>
      {error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <button
        type="submit"
        disabled={!canSubmit}
        className="mt-3 inline-flex items-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900"
      >
        {isSubmitting ? 'Posting...' : 'Post session'}
      </button>
    </form>
  )
}
