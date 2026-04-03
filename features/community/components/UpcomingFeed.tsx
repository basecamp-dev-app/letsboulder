'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createCommunityCommentAction, deleteCommunityCommentAction, saveCommunityRsvpAction } from '@/features/community/actions'
import { CommunitySessionPost } from '@/types/community'
import { communityKeys, fetchEngagement, type PostEngagement, type SessionComment } from '@/features/community/lib/queries'

interface UpcomingFeedProps {
  posts: CommunitySessionPost[]
}

type RsvpStatus = 'going' | 'interested'

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
  const queryClient = useQueryClient()
  const [expandedComments, setExpandedComments] = useState(false)
  const [commentBody, setCommentBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: engagement, isLoading: isLoadingEngagement } = useQuery({
    queryKey: communityKeys.engagement(post.id),
    queryFn: () => fetchEngagement(post.id),
    meta: { persist: true },
  })

  const rsvpMutation = useMutation({
    mutationFn: ({ status }: { status: RsvpStatus | null }) =>
      saveCommunityRsvpAction(post.id, status),
    onMutate: async ({ status: nextStatus }) => {
      await queryClient.cancelQueries({ queryKey: communityKeys.engagement(post.id) })
      const previous = queryClient.getQueryData<PostEngagement>(communityKeys.engagement(post.id))
      if (!previous) return { previous }

      const previousViewerStatus = previous.viewer_rsvp
      const statusToSend = previousViewerStatus === nextStatus ? null : nextStatus
      const optimisticCounts = { ...previous.rsvp_counts }

      if (previousViewerStatus === 'going') optimisticCounts.going = Math.max(0, optimisticCounts.going - 1)
      if (previousViewerStatus === 'interested') optimisticCounts.interested = Math.max(0, optimisticCounts.interested - 1)
      if (statusToSend === 'going') optimisticCounts.going += 1
      if (statusToSend === 'interested') optimisticCounts.interested += 1

      queryClient.setQueryData<PostEngagement>(communityKeys.engagement(post.id), {
        ...previous,
        rsvp_counts: optimisticCounts,
        viewer_rsvp: statusToSend,
      })

      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(communityKeys.engagement(post.id), context.previous)
      }
    },
    onSettled: (result) => {
      if (result?.status === 401) {
        setError('Sign in to RSVP.')
        return
      }
      if (!result?.success) {
        setError('Could not update RSVP.')
        return
      }
      if (result?.data) {
        queryClient.setQueryData<PostEngagement>(communityKeys.engagement(post.id), (prev) => ({
          rsvp_counts: result.data!.rsvp_counts,
          viewer_rsvp: result.data!.viewer_rsvp,
          comments: prev?.comments || [],
        }))
      }
    },
  })

  const commentMutation = useMutation({
    mutationFn: (body: string) => createCommunityCommentAction(post.id, body),
    onMutate: async (trimmed) => {
      await queryClient.cancelQueries({ queryKey: communityKeys.engagement(post.id) })
      const previous = queryClient.getQueryData<PostEngagement>(communityKeys.engagement(post.id))
      const optimisticComment: SessionComment = {
        id: `temp-${Date.now()}`,
        body: trimmed,
        created_at: new Date().toISOString(),
        author: null,
        is_owner: true,
        is_pending: true,
      }

      queryClient.setQueryData<PostEngagement>(communityKeys.engagement(post.id), {
        rsvp_counts: previous?.rsvp_counts || { going: 0, interested: 0 },
        viewer_rsvp: previous?.viewer_rsvp || null,
        comments: [...(previous?.comments || []), optimisticComment],
      })

      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(communityKeys.engagement(post.id), context.previous)
      }
    },
    onSettled: (result, _err, _vars, context) => {
      if (result?.status === 401) {
        setCommentBody(_vars)
        setError('Sign in to comment.')
        return
      }
      if (!result?.success) {
        setCommentBody(_vars)
        setError('Could not post comment.')
        return
      }
      if (result?.data) {
        queryClient.setQueryData<PostEngagement>(communityKeys.engagement(post.id), (prev) => ({
          rsvp_counts: prev?.rsvp_counts || { going: 0, interested: 0 },
          viewer_rsvp: prev?.viewer_rsvp || null,
          comments: result.data!.comments,
        }))
      }
    },
  })

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string) => deleteCommunityCommentAction(post.id, commentId),
    onMutate: async (commentId) => {
      await queryClient.cancelQueries({ queryKey: communityKeys.engagement(post.id) })
      const previous = queryClient.getQueryData<PostEngagement>(communityKeys.engagement(post.id))

      queryClient.setQueryData<PostEngagement>(communityKeys.engagement(post.id), (prev) => {
        if (!prev) return prev
        return {
          ...prev,
          comments: prev.comments.filter(c => c.id !== commentId),
        }
      })

      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(communityKeys.engagement(post.id), context.previous)
      }
      setError('Could not delete comment.')
    },
    onSettled: (result) => {
      if (result?.success) {
        queryClient.invalidateQueries({ queryKey: communityKeys.engagement(post.id) })
      }
    },
  })

  function handleRsvp(nextStatus: RsvpStatus) {
    if (rsvpMutation.isPending) return
    setError(null)
    void rsvpMutation.mutate({ status: nextStatus })
  }

  function handleCommentSubmit() {
    const trimmed = commentBody.trim()
    if (!trimmed || commentMutation.isPending) return
    setError(null)
    setCommentBody('')
    setExpandedComments(true)
    void commentMutation.mutate(trimmed)
  }

  function handleCommentDelete(commentId: string) {
    if (!commentId || deleteCommentMutation.isPending) return
    const confirmed = window.confirm('Delete this comment?')
    if (!confirmed) return
    setError(null)
    void deleteCommentMutation.mutate(commentId)
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
      <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <p>Posted by {authorLabel(post)}</p>
        {post.is_pending ? <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">Sending...</span> : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => handleRsvp('going')}
          disabled={rsvpMutation.isPending || isLoadingEngagement}
          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition ${engagement?.viewer_rsvp === 'going'
            ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
            : 'border-gray-300 text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800'}`}
        >
          Going ({goingCount})
        </button>
        <button
          type="button"
          onClick={() => handleRsvp('interested')}
          disabled={rsvpMutation.isPending || isLoadingEngagement}
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
              onClick={handleCommentSubmit}
              disabled={commentMutation.isPending || !commentBody.trim()}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900"
            >
              {commentMutation.isPending ? 'Posting...' : 'Post comment'}
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
                        onClick={() => handleCommentDelete(comment.id)}
                        disabled={deleteCommentMutation.isPending}
                        className="text-xs font-medium text-gray-600 underline dark:text-gray-300"
                      >
                        {deleteCommentMutation.variables === comment.id ? 'Deleting...' : 'Delete'}
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
