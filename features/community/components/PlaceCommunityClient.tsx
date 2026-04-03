'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import SessionComposer from '@/features/community/components/SessionComposer'
import UpcomingFeed from '@/features/community/components/UpcomingFeed'
import UpdateComposer from '@/features/community/components/UpdateComposer'
import UpdatesFeed from '@/features/community/components/UpdatesFeed'
import { communityKeys } from '@/features/community/lib/queries'
import type { CommunitySessionPost, CommunityUpdatePost } from '@/types/community'

interface PlaceCommunityClientProps {
  activeTab: 'upcoming' | 'updates'
  placeId: string
  sessionPosts: CommunitySessionPost[]
  updatePosts: CommunityUpdatePost[]
}

function sortSessionPosts(posts: CommunitySessionPost[]) {
  return [...posts].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
}

function sortUpdatePosts(posts: CommunityUpdatePost[]) {
  return [...posts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}

export default function PlaceCommunityClient({ activeTab, placeId, sessionPosts, updatePosts }: PlaceCommunityClientProps) {
  const queryClient = useQueryClient()
  const [localSessionPosts, setLocalSessionPosts] = useState(() => sortSessionPosts(sessionPosts))
  const [localUpdatePosts, setLocalUpdatePosts] = useState(() => sortUpdatePosts(updatePosts))

  function invalidateCommunityCache() {
    queryClient.invalidateQueries({ queryKey: communityKeys.all })
  }

  function addOptimisticSession(post: CommunitySessionPost) {
    setLocalSessionPosts(current => sortSessionPosts([...current, post]))
  }

  function replaceSession(tempId: string, post: CommunitySessionPost) {
    setLocalSessionPosts(current => sortSessionPosts(current.map(item => (item.id === tempId ? post : item))))
    invalidateCommunityCache()
  }

  function removeSession(tempId: string) {
    setLocalSessionPosts(current => current.filter(item => item.id !== tempId))
  }

  function addOptimisticUpdate(post: CommunityUpdatePost) {
    setLocalUpdatePosts(current => sortUpdatePosts([post, ...current]))
  }

  function replaceUpdate(tempId: string, post: CommunityUpdatePost) {
    setLocalUpdatePosts(current => sortUpdatePosts(current.map(item => (item.id === tempId ? post : item))))
    invalidateCommunityCache()
  }

  function removeUpdate(tempId: string) {
    setLocalUpdatePosts(current => current.filter(item => item.id !== tempId))
  }

  if (activeTab === 'upcoming') {
    return (
      <>
        <div className="mt-4">
          <SessionComposer
            placeId={placeId}
            onOptimisticCreate={addOptimisticSession}
            onCreateSuccess={replaceSession}
            onCreateError={removeSession}
          />
        </div>
        <div className="mt-4">
          <UpcomingFeed posts={localSessionPosts} />
        </div>
      </>
    )
  }

  return (
    <>
      <div className="mt-4">
        <UpdateComposer
          placeId={placeId}
          onOptimisticCreate={addOptimisticUpdate}
          onCreateSuccess={replaceUpdate}
          onCreateError={removeUpdate}
        />
      </div>
      <div className="mt-4">
        <UpdatesFeed posts={localUpdatePosts} />
      </div>
    </>
  )
}
