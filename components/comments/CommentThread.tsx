'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2, MessageSquare, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { csrfFetch } from '@/hooks/useCsrf'

type TargetType = 'crag' | 'image' | 'climb'
type CommentCategory =
  | 'history'
  | 'broken_hold'
  | 'beta'
  | 'conditions'
  | 'access'
  | 'approach'
  | 'parking'
  | 'closure'
  | 'general'
  | 'grade'
  | 'fa_history'
  | 'safety'
  | 'gear_protection'
  | 'approach_access'
  | 'descent'
  | 'rock_quality'
  | 'highlights'
  | 'variations'

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

interface CategoryOption {
  value: CommentCategory
  label: string
}

interface TargetThreadConfig {
  title: string
  placeholder: string
  emptyState: string
  defaultCategory: CommentCategory
  categories: CategoryOption[]
}

interface CommentThreadProps {
  targetType: TargetType
  targetId: string
  className?: string
  userId?: string | null
}

const TARGET_THREAD_CONFIG: Record<TargetType, TargetThreadConfig> = {
  crag: {
    title: 'Crag updates',
    placeholder: 'Share access, approach, parking, closure, and area-wide updates...',
    emptyState: 'No crag updates yet. Share access and approach info for the community.',
    defaultCategory: 'access',
    categories: [
      { value: 'access', label: 'Access' },
      { value: 'approach', label: 'Approach' },
      { value: 'parking', label: 'Parking' },
      { value: 'closure', label: 'Closure' },
      { value: 'general', label: 'General' },
    ],
  },
  image: {
    title: 'Topo notes',
    placeholder: 'Share beta, FA/history, gear, and conditions. For line or photo issues, use the Flag button.',
    emptyState: 'No topo notes yet. Share useful route context and positive details for the community.',
    defaultCategory: 'beta',
    categories: [
      { value: 'beta', label: 'Beta' },
      { value: 'fa_history', label: 'FA / History' },
      { value: 'safety', label: 'Safety' },
      { value: 'gear_protection', label: 'Gear / Protection' },
      { value: 'conditions', label: 'Conditions' },
      { value: 'approach_access', label: 'Approach / Access' },
      { value: 'descent', label: 'Descent' },
      { value: 'rock_quality', label: 'Rock quality' },
      { value: 'highlights', label: 'Highlights' },
      { value: 'variations', label: 'Variations' },
    ],
  },
  climb: {
    title: 'Climb notes',
    placeholder: 'Share climb beta, hold changes, grade opinions, and conditions...',
    emptyState: 'No climb notes yet. Be the first to share useful beta.',
    defaultCategory: 'beta',
    categories: [
      { value: 'beta', label: 'Beta' },
      { value: 'broken_hold', label: 'Broken hold' },
      { value: 'conditions', label: 'Conditions' },
      { value: 'grade', label: 'Grade' },
      { value: 'history', label: 'History' },
    ],
  },
}

const CATEGORY_LABELS: Record<CommentCategory, string> = {
  history: 'History',
  broken_hold: 'Broken hold',
  beta: 'Beta',
  conditions: 'Conditions',
  access: 'Access',
  approach: 'Approach',
  parking: 'Parking',
  closure: 'Closure',
  general: 'General',
  grade: 'Grade',
  fa_history: 'FA / History',
  safety: 'Safety',
  gear_protection: 'Gear / Protection',
  approach_access: 'Approach / Access',
  descent: 'Descent',
  rock_quality: 'Rock quality',
  highlights: 'Highlights',
  variations: 'Variations',
}

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

export default function CommentThread({ targetType, targetId, className, userId }: CommentThreadProps) {
  const [comments, setComments] = useState<CommentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [commentBody, setCommentBody] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(userId ?? null)

  const threadConfig = TARGET_THREAD_CONFIG[targetType]
  const [category, setCategory] = useState<CommentCategory>(threadConfig.defaultCategory)

  const cachedCommentsRef = useRef<Record<string, { comments: CommentItem[]; nextOffset: number | null }>>({})

  const hasMore = nextOffset !== null
  const isSignedIn = !!resolvedUserId
  const authRedirect = useMemo(() => {
    const fallbackPath = targetType === 'image' ? `/image/${targetId}` : targetType === 'crag' ? `/crag/${targetId}` : `/climb/${targetId}`
    return `/auth?redirect_to=${encodeURIComponent(fallbackPath)}`
  }, [targetId, targetType])

  const fetchComments = useCallback(async (offset = 0, append = false) => {
    const cacheKey = `${targetType}:${targetId}:${categoryFilter}`

    if (!append && offset === 0 && cachedCommentsRef.current[cacheKey]) {
      const cached = cachedCommentsRef.current[cacheKey]
      setComments(cached.comments)
      setNextOffset(cached.nextOffset)
      setLoading(false)
      setLoadingMore(false)
      return
    }

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

      const finalNextOffset = typeof payload.nextOffset === 'number' ? payload.nextOffset : null

      if (!append && offset === 0) {
        cachedCommentsRef.current[cacheKey] = { comments: incoming, nextOffset: finalNextOffset }
      }

      setComments((prev) => (append ? [...prev, ...incoming] : incoming))
      setNextOffset(finalNextOffset)
      setError(null)
    } catch (err) {
      console.error('Comments load error:', err)
      setError('Could not load comments')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [categoryFilter, targetId, targetType])

  useEffect(() => {
    setCategory(threadConfig.defaultCategory)
    setCategoryFilter('all')
    setComments([])
    setNextOffset(null)

    Object.keys(cachedCommentsRef.current).forEach((key) => {
      if (key.includes(targetId)) {
        delete cachedCommentsRef.current[key]
      }
    })
  }, [targetId, threadConfig.defaultCategory])

  useEffect(() => {
    if (userId !== undefined) {
      setResolvedUserId(userId)
    }
  }, [userId])

  useEffect(() => {
    if (userId !== undefined) return

    const supabase = createClient()

    void (async () => {
      const { data } = await supabase.auth.getUser()
      setResolvedUserId(data.user?.id || null)
    })()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setResolvedUserId(session?.user?.id || null)
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [userId])

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
        if (categoryFilter === 'all' || newComment.category === categoryFilter) {
          setComments((prev) => [newComment, ...prev])
        }
      }

      setCommentBody('')
      setCategory(threadConfig.defaultCategory)
      setError(null)
    } catch (err) {
      console.error('Comment submit error:', err)
      setError('Could not post comment')
    } finally {
      setSubmitting(false)
    }
  }, [category, categoryFilter, commentBody, isSignedIn, submitting, targetId, targetType, threadConfig.defaultCategory])

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
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{threadConfig.title}</h2>
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
                {threadConfig.categories.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <textarea
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value.slice(0, MAX_COMMENT_LENGTH))}
              placeholder={threadConfig.placeholder}
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
            <Link href={authRedirect} className="font-medium text-gray-900 underline underline-offset-2 dark:text-gray-100">Sign in</Link> to post updates.
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
          {threadConfig.categories.map((option) => (
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
        <p className="text-sm text-gray-500 dark:text-gray-400">{threadConfig.emptyState}</p>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <article key={comment.id} className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                    {CATEGORY_LABELS[comment.category] || 'Other'}
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
          ))}
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
