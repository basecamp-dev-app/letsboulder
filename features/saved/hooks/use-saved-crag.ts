'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session, User, UserResponse } from '@supabase/supabase-js'
import { saveCragAction } from '@/features/saved/actions/save-crag'
import { unsaveCragAction } from '@/features/saved/actions/unsave-crag'
import { createClient } from '@/lib/supabase'

export function getSavedCragQueryKey(userId: string, cragId: string) {
  return ['saved', 'crag', userId, cragId] as const
}

export function useSavedCrag(cragId: string) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const queryKey = getSavedCragQueryKey(user?.id ?? 'anonymous', cragId)

  useEffect(() => {
    let mounted = true
    const supabase = createClient()

    void supabase.auth.getUser().then(({ data }: UserResponse) => {
      if (mounted) setUser(data.user)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      setUser(session?.user ?? null)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const savedQuery = useQuery({
    queryKey,
    enabled: Boolean(user),
    queryFn: async () => {
      if (!user) return false

      const { data, error } = await createClient()
        .from('saved_crags')
        .select('crag_id')
        .eq('user_id', user.id)
        .eq('crag_id', cragId)
        .maybeSingle()

      if (error) throw error
      return Boolean(data)
    },
  })

  const mutation = useMutation({
    mutationFn: async (nextSaved: boolean) => {
      const result = nextSaved ? await saveCragAction(cragId) : await unsaveCragAction(cragId)
      if (!result.success) throw new Error(result.error || 'Failed to update saved crag')
      return nextSaved
    },
    onMutate: async (nextSaved) => {
      await queryClient.cancelQueries({ queryKey })
      const previousSaved = queryClient.getQueryData<boolean>(queryKey)
      queryClient.setQueryData(queryKey, nextSaved)
      return { previousSaved }
    },
    onError: (_error, _nextSaved, context) => {
      queryClient.setQueryData(queryKey, context?.previousSaved)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })

  const isHydrating = user === undefined || (Boolean(user) && savedQuery.isPending)

  return {
    isAnonymous: user === null,
    isSaved: Boolean(user && savedQuery.data),
    isHydrating,
    isError: savedQuery.isError,
    isPending: mutation.isPending,
    toggle: () => mutation.mutateAsync(!Boolean(savedQuery.data)),
  }
}
