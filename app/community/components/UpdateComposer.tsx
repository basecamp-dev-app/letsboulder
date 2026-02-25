'use client'

import { FormEvent, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { csrfFetch } from '@/hooks/useCsrf'

interface UpdateComposerProps {
  placeId: string
}

type UpdatePostType = 'update' | 'conditions' | 'question'

export default function UpdateComposer({ placeId }: UpdateComposerProps) {
  const router = useRouter()
  const [type, setType] = useState<UpdatePostType>('update')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = useMemo(() => {
    return body.trim().length > 0 && !isSubmitting
  }, [body, isSubmitting])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const trimmedBody = body.trim()
    const trimmedTitle = title.trim()

    if (trimmedBody.length < 4) {
      setError('Please add a bit more detail.')
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
          type,
          place_id: placeId,
          title: trimmedTitle || null,
          body: trimmedBody,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({} as { error?: string }))
        setError(payload.error || 'Failed to publish update.')
        return
      }

      setBody('')
      setTitle('')
      setType('update')
      router.refresh()
    } catch {
      setError('Could not publish update right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Post an update</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-gray-700 dark:text-gray-300">
          Type
          <select
            value={type}
            onChange={event => setType(event.target.value as UpdatePostType)}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
          >
            <option value="update">General update</option>
            <option value="conditions">Conditions update</option>
            <option value="question">Question</option>
          </select>
        </label>
        <label className="text-sm text-gray-700 dark:text-gray-300">
          Title (optional)
          <input
            type="text"
            value={title}
            onChange={event => setTitle(event.target.value)}
            maxLength={120}
            placeholder={
              type === 'conditions'
                ? 'e.g. North wall dry after 2pm'
                : type === 'question'
                  ? 'e.g. Best warmups here?'
                  : 'e.g. New circuits opened this week'
            }
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
          />
        </label>
      </div>

      <label className="mt-3 block text-sm text-gray-700 dark:text-gray-300">
        Details
        <textarea
          required
          value={body}
          onChange={event => setBody(event.target.value)}
          rows={4}
          maxLength={2000}
          placeholder={
            type === 'conditions'
              ? 'Share conditions, crowd level, access issues, or weather notes.'
              : type === 'question'
                ? 'Ask your question with enough context for useful answers.'
                : 'Share a general update about this place.'
          }
          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
        />
      </label>

      {error ? <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <button
        type="submit"
        disabled={!canSubmit}
        className="mt-3 inline-flex items-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900"
      >
        {isSubmitting ? 'Posting...' : 'Post update'}
      </button>
    </form>
  )
}
