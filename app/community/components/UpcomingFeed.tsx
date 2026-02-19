'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { csrfFetch } from '@/hooks/useCsrf'
import { CommunitySessionPost } from '@/types/community'

interface UpcomingFeedProps {
  posts: CommunitySessionPost[]
}

type RsvpStatus = 'going' | 'interested'

interface SessionComment {
  id: string
  body: string
  created_at: string
  author: {
    id: string
    username: string | null
    display_name: string | null
    avatar_url: string | null
  } | null
  is_owner: boolean
  is_pending?: boolean
}

interface PostEngagement {
  rsvp_counts: {
    going: number
    interested: number
  }
  viewer_rsvp: RsvpStatus | null
  comments: SessionComment[]
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown time'

  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function authorLabel(post: CommunitySessionPost): string {
  if (post.author?.display_name) return post.author.display_name
  if (post.author?.username) return `@${post.author.username}`
  return 'Community member'
}

export default function UpcomingFeed({ posts }: UpcomingFeedProps) {
  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
        No upcoming sessions yet. Be the first to plan one at this place.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {posts.map(post => <UpcomingSessionCard key={post.id} post={post} />)}
    </div>
  )
}

function UpcomingSessionCard({ post }: { post: CommunitySessionPost }) {
  const [engagement, setEngagement] = useState<PostEngagement | null>(null)
  const [expandedComments, setExpandedComments] = useState(false)
  const [commentBody, setCommentBody] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingRsvp, setIsSavingRsvp] = useState(false)
  const [isPostingComment, setIsPostingComment] = useState(false)
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadEngagement = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/community/posts/${post.id}/engagement`, { cache: 'no-store' })
      if (!response.ok) {
        setError('Could not load session engagement.')
        return
      }
      const data = await response.json().catch(() => null as PostEngagement | null)
      if (!data) {
        setError('Could not load session engagement.')
        return
      }
      setEngagement(data)
      setError(null)
    } catch {
      setError('Could not load session engagement.')
    } finally {
      setIsLoading(false)
    }
  }, [post.id])

  useEffect(() => {
    void loadEngagement()
  }, [loadEngagement])

  async function handleRsvp(nextStatus: RsvpStatus) {
    if (isSavingRsvp) return

    const previousEngagement = engagement
    const previousViewerStatus = previousEngagement?.viewer_rsvp || null
    const statusToSend = previousViewerStatus === nextStatus ? null : nextStatus

    if (previousEngagement) {
      const optimisticCounts = {
        going: previousEngagement.rsvp_counts.going,
        interested: previousEngagement.rsvp_counts.interested,
      }

      if (previousViewerStatus === 'going') optimisticCounts.going = Math.max(0, optimisticCounts.going - 1)
      if (previousViewerStatus === 'interested') optimisticCounts.interested = Math.max(0, optimisticCounts.interested - 1)
      if (statusToSend === 'going') optimisticCounts.going += 1
      if (statusToSend === 'interested') optimisticCounts.interested += 1

      setEngagement({
        ...previousEngagement,
        rsvp_counts: optimisticCounts,
        viewer_rsvp: statusToSend,
      })
    }

    setIsSavingRsvp(true)
    setError(null)

    try {
      const response = await csrfFetch(`/api/community/posts/${post.id}/rsvp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: statusToSend }),
      })

      if (response.status === 401) {
        if (previousEngagement) setEngagement(previousEngagement)
        setError('Sign in to RSVP.')
        return
      }

      if (!response.ok) {
        if (previousEngagement) setEngagement(previousEngagement)
        setError('Could not update RSVP.')
        return
      }

      const data = await response.json().catch(() => null as { rsvp_counts: { going: number; interested: number }; viewer_rsvp: RsvpStatus | null } | null)
      if (!data) {
        if (previousEngagement) setEngagement(previousEngagement)
        setError('Could not update RSVP.')
        return
      }

      setEngagement(prev => ({
        rsvp_counts: data.rsvp_counts,
        viewer_rsvp: data.viewer_rsvp,
        comments: prev?.comments || [],
      }))
    } catch {
      if (previousEngagement) setEngagement(previousEngagement)
      setError('Could not update RSVP.')
    } finally {
      setIsSavingRsvp(false)
    }
  }

  async function handleCommentSubmit() {
    const trimmed = commentBody.trim()
    if (!trimmed || isPostingComment) return

    const optimisticCommentId = `temp-${Date.now()}`
    const optimisticComment: SessionComment = {
      id: optimisticCommentId,
      body: trimmed,
      created_at: new Date().toISOString(),
      author: null,
      is_owner: true,
      is_pending: true,
    }

    const previousEngagement = engagement
    setEngagement(prev => ({
      rsvp_counts: prev?.rsvp_counts || { going: 0, interested: 0 },
      viewer_rsvp: prev?.viewer_rsvp || null,
      comments: [...(prev?.comments || []), optimisticComment],
    }))
    setCommentBody('')
    setExpandedComments(true)

    setIsPostingComment(true)
    setError(null)
    try {
      const response = await csrfFetch(`/api/community/posts/${post.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body: trimmed }),
      })

      if (response.status === 401) {
        if (previousEngagement) {
          setEngagement(previousEngagement)
        } else {
          setEngagement(prev => {
            if (!prev) return prev
            return {
              ...prev,
              comments: prev.comments.filter(comment => comment.id !== optimisticCommentId),
            }
          })
        }
        setCommentBody(trimmed)
        setError('Sign in to comment.')
        return
      }

      if (!response.ok) {
        if (previousEngagement) {
          setEngagement(previousEngagement)
        } else {
          setEngagement(prev => {
            if (!prev) return prev
            return {
              ...prev,
              comments: prev.comments.filter(comment => comment.id !== optimisticCommentId),
            }
          })
        }
        setCommentBody(trimmed)
        setError('Could not post comment.')
        return
      }

      const data = await response.json().catch(() => null as { comments: SessionComment[] } | null)
      if (!data) {
        if (previousEngagement) {
          setEngagement(previousEngagement)
        } else {
          setEngagement(prev => {
            if (!prev) return prev
            return {
              ...prev,
              comments: prev.comments.filter(comment => comment.id !== optimisticCommentId),
            }
          })
        }
        setCommentBody(trimmed)
        setError('Could not post comment.')
        return
      }

      setEngagement(prev => ({
        rsvp_counts: prev?.rsvp_counts || { going: 0, interested: 0 },
        viewer_rsvp: prev?.viewer_rsvp || null,
        comments: data.comments,
      }))
    } catch {
      if (previousEngagement) {
        setEngagement(previousEngagement)
      } else {
        setEngagement(prev => {
          if (!prev) return prev
          return {
            ...prev,
            comments: prev.comments.filter(comment => comment.id !== optimisticCommentId),
          }
        })
      }
      setCommentBody(trimmed)
      setError('Could not post comment.')
    } finally {
      setIsPostingComment(false)
    }
  }

  async function handleCommentDelete(commentId: string) {
    if (!commentId || deletingCommentId) return
    const confirmed = window.confirm('Delete this comment?')
    if (!confirmed) return

    setDeletingCommentId(commentId)
    setError(null)

    const previousEngagement = engagement
    setEngagement(prev => {
      if (!prev) return prev
      return {
        ...prev,
        comments: prev.comments.filter(comment => comment.id !== commentId),
      }
    })

    try {
      const response = await csrfFetch(`/api/community/posts/${post.id}/comments/${commentId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        if (previousEngagement) setEngagement(previousEngagement)
        setError('Could not delete comment.')
        return
      }
    } catch {
      if (previousEngagement) setEngagement(previousEngagement)
      setError('Could not delete comment.')
    } finally {
      setDeletingCommentId(null)
    }
  }

  const goingCount = engagement?.rsvp_counts.going || 0
  const interestedCount = engagement?.rsvp_counts.interested || 0
  const comments = engagement?.comments || []

  return (
    <article className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatDateTime(post.start_at)}</p>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
        {post.discipline ? post.discipline.replace('_', ' ') : 'All disciplines'}
        {post.grade_min || post.grade_max ? ` • ${post.grade_min || '?'} to ${post.grade_max || '?'}` : ''}
      </p>
      <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">{post.body}</p>
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">Posted by {authorLabel(post)}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleRsvp('going')}
          disabled={isSavingRsvp || isLoading}
          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${engagement?.viewer_rsvp === 'going'
            ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
            : 'border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800'}`}
        >
          Going ({goingCount})
        </button>
        <button
          type="button"
          onClick={() => void handleRsvp('interested')}
          disabled={isSavingRsvp || isLoading}
          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${engagement?.viewer_rsvp === 'interested'
            ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
            : 'border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800'}`}
        >
          Interested ({interestedCount})
        </button>
        <button
          type="button"
          onClick={() => setExpandedComments(prev => !prev)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          {expandedComments ? 'Hide comments' : `Comments (${comments.length})`}
        </button>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}{' '}
          {(error.includes('Sign in')) ? <Link href="/auth" className="underline">Go to sign in</Link> : null}
        </p>
      ) : null}

      {expandedComments ? (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/40">
          <textarea
            value={commentBody}
            onChange={event => setCommentBody(event.target.value.slice(0, 2000))}
            rows={3}
            placeholder="Ask a question or share details"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400">{commentBody.length}/2000</p>
            <button
              type="button"
              onClick={() => void handleCommentSubmit()}
              disabled={isPostingComment || !commentBody.trim()}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900"
            >
              {isPostingComment ? 'Posting...' : 'Post comment'}
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {comments.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">No comments yet.</p>
            ) : (
              comments.map(comment => (
                <article key={comment.id} className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      {comment.author?.display_name || (comment.author?.username ? `@${comment.author.username}` : (comment.is_owner ? 'You' : 'Community member'))}
                      <span className="ml-2 text-gray-500 dark:text-gray-400">{formatDateTime(comment.created_at)}</span>
                      {comment.is_pending ? <span className="ml-2 text-gray-400">Sending...</span> : null}
                    </p>
                    {comment.is_owner ? (
                      <button
                        type="button"
                        onClick={() => void handleCommentDelete(comment.id)}
                        disabled={deletingCommentId === comment.id}
                        className="text-xs font-medium text-gray-600 underline dark:text-gray-300"
                      >
                        {deletingCommentId === comment.id ? 'Deleting...' : 'Delete'}
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-100">{comment.body}</p>
                </article>
              ))
            )}
          </div>
        </div>
      ) : null}
    </article>
  )
}
