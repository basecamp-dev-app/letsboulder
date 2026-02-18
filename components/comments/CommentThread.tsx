'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2, MessageSquare, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { csrfFetch } from '@/hooks/useCsrf'

type TargetType = 'crag' | 'image'
type CommentCategory = 'history' | 'broken_hold' | 'approach_beta' | 'beta' | 'conditions' | 'other'
type CategoryFilter = CommentCategory | 'all'

interface CommentItem {
  id: string
  target_type: TargetType
  target_id: string
  author_id: string | null
  body: string
  category: CommentCategory
  created_at: string
  is_owner: boolean
}

interface CommentThreadProps {
  targetType: TargetType
  targetId: string
  className?: string
}

const CATEGORY_OPTIONS: Array<{ value: CommentCategory; label: string }> = [
  { value: 'beta', label: 'Beta' },
  { value: 'approach_beta', label: 'Approach beta' },
  { value: 'broken_hold', label: 'Broken hold' },
  { value: 'history', label: 'History' },
  { value: 'conditions', label: 'Conditions' },
  { value: 'other', label: 'Other' },
]

const LIMIT = 20
const MAX_COMMENT_LENGTH = 2000

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'

  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function CommentThread({ targetType, targetId, className }: CommentThreadProps) {
  const [comments, setComments] = useState<CommentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [commentBody, setCommentBody] = useState('')
  const [category, setCategory] = useState<CommentCategory>('beta')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  const hasMore = nextOffset !== null
  const isSignedIn = !!userId
  const authRedirect = useMemo(() => {
    const fallbackPath = targetType === 'image' ? `/image/${targetId}` : `/crag/${targetId}`
    return `/auth?redirect_to=${encodeURIComponent(fallbackPath)}`
  }, [targetId, targetType])

  const fetchComments = useCallback(async (offset = 0, append = false) => {
    if (!append) {
      setLoading(true)
    } else {
      setLoadingMore(true)
    }

    try {
      const params = new URLSearchParams({
        targetType,
        targetId,
        limit: String(LIMIT),
        offset: String(offset),
      })

      if (categoryFilter !== 'all') {
        params.set('category', categoryFilter)
      }

      const response = await fetch(`/api/comments?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
      })

      const data = await response.json().catch(() => null as unknown)

      if (!response.ok || !data || typeof data !== 'object') {
        throw new Error('Failed to load comments')
      }

      const payload = data as { comments?: CommentItem[]; nextOffset?: number | null }
      const incoming = Array.isArray(payload.comments) ? payload.comments : []

      setComments((prev) => (append ? [...prev, ...incoming] : incoming))
      setNextOffset(typeof payload.nextOffset === 'number' ? payload.nextOffset : null)
      setError(null)
    } catch (err) {
      console.error('Comments load error:', err)
      setError('Could not load community comments')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [categoryFilter, targetId, targetType])

  useEffect(() => {
    const supabase = createClient()

    void (async () => {
      const { data } = await supabase.auth.getUser()
      setUserId(data.user?.id || null)
    })()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id || null)
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    void fetchComments(0, false)
  }, [fetchComments])

  const handleSubmit = useCallback(async () => {
    const trimmedBody = commentBody.trim()
    if (!trimmedBody || !isSignedIn || submitting) return

    setSubmitting(true)

    try {
      const response = await csrfFetch('/api/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetType,
          targetId,
          body: trimmedBody,
          category,
        }),
      })

      const data = await response.json().catch(() => null as unknown)

      if (!response.ok || !data || typeof data !== 'object') {
        throw new Error('Failed to post comment')
      }

      const payload = data as { comment?: CommentItem }
      const newComment = payload.comment
      if (newComment) {
        setComments((prev) => [newComment, ...prev])
      }

      setCommentBody('')
      setCategory('beta')
      setError(null)
    } catch (err) {
      console.error('Comment submit error:', err)
      setError('Could not post comment')
    } finally {
      setSubmitting(false)
    }
  }, [category, commentBody, isSignedIn, submitting, targetId, targetType])

  const handleDelete = useCallback(async (commentId: string) => {
    if (!commentId || deletingId) return
    const confirmed = window.confirm('Delete this comment?')
    if (!confirmed) return

    setDeletingId(commentId)

    try {
      const response = await csrfFetch(`/api/comments/${commentId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete comment')
      }

      setComments((prev) => prev.filter((comment) => comment.id !== commentId))
      setError(null)
    } catch (err) {
      console.error('Comment delete error:', err)
      setError('Could not delete comment')
    } finally {
      setDeletingId(null)
    }
  }, [deletingId])

  return (
    <section className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 ${className || ''}`}>
      <div className="mb-4 flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-gray-700 dark:text-gray-300" />
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Community board</h2>
      </div>

      <div className="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/60">
        {isSignedIn ? (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <label htmlFor={`${targetType}-comment-category`} className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Category
              </label>
              <select
                id={`${targetType}-comment-category`}
                value={category}
                onChange={(event) => setCategory(event.target.value as CommentCategory)}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <textarea
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value.slice(0, MAX_COMMENT_LENGTH))}
              placeholder="Share beta, conditions, hold changes, and local history..."
              rows={4}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
            <div className="mt-2 flex items-center justify-between">
              <p className="text-xs text-gray-500 dark:text-gray-400">{commentBody.length}/{MAX_COMMENT_LENGTH}</p>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting || !commentBody.trim()}
                className="inline-flex items-center rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300"
              >
                {submitting ? 'Posting...' : 'Post comment'}
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            <Link href={authRedirect} className="font-medium text-gray-900 underline underline-offset-2 dark:text-gray-100">Sign in</Link> to post community updates.
          </p>
        )}
      </div>

      <div className="mb-3 flex items-center justify-between gap-2">
        <label htmlFor={`${targetType}-comment-filter`} className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Filter
        </label>
        <select
          id={`${targetType}-comment-filter`}
          value={categoryFilter}
          onChange={(event) => {
            setCategoryFilter(event.target.value as CategoryFilter)
            setNextOffset(null)
            setComments([])
          }}
          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-gray-500 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        >
          <option value="all">All categories</option>
          {CATEGORY_OPTIONS.map((option) => (
            <option key={`filter-${option.value}`} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      {error && (
        <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-500 dark:text-gray-400" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No comments yet. Be the first to share beta.</p>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => {
            const categoryLabel = CATEGORY_OPTIONS.find((option) => option.value === comment.category)?.label || 'Other'

            return (
              <article key={comment.id} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                      {categoryLabel}
                    </span>
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                      {comment.is_owner ? 'You' : 'Community member'}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{formatTimestamp(comment.created_at)}</span>
                  </div>
                  {comment.is_owner && (
                    <button
                      type="button"
                      onClick={() => void handleDelete(comment.id)}
                      disabled={deletingId === comment.id}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {deletingId === comment.id ? 'Deleting...' : 'Delete'}
                    </button>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-100">{comment.body}</p>
              </article>
            )
          })}
        </div>
      )}

      {hasMore && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => void fetchComments(nextOffset || 0, true)}
            disabled={loadingMore}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            {loadingMore ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </section>
  )
}
