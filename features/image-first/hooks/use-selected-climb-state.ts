'use client'

import { useEffect, useState } from 'react'
import type { GradeOpinion } from '@/lib/grade-feedback'
import { createClient } from '@/lib/supabase'
import { isClimbSavedByUser } from '@/features/saved/lib/queries'
import type { Database } from '@/types/database'

type UserClimbRow = Database['public']['Tables']['user_climbs']['Row']

export interface SelectedClimbLog {
  gradeOpinion: GradeOpinion | null
  starRating: number | null
  notes: string | null
}

export interface SelectedClimbRatingSummary {
  rating_avg: number | null
  rating_count: number
}

function toLoggedClimbInfo(row: UserClimbRow | null): SelectedClimbLog | null {
  if (!row) return null
  return {
    gradeOpinion: row.grade_opinion === 'soft' || row.grade_opinion === 'agree' || row.grade_opinion === 'hard'
      ? row.grade_opinion
      : null,
    starRating: row.star_rating,
    notes: row.notes,
  }
}

export function useSelectedClimbState({
  activeClimbId,
  activeEffectiveClimbId,
  pendingLogClimbIds,
  userPresent,
}: {
  activeClimbId: string | null
  activeEffectiveClimbId: string | null
  pendingLogClimbIds: Set<string>
  userPresent: boolean
}) {
  const [selectedClimbLogged, setSelectedClimbLogged] = useState(false)
  const [selectedClimbLog, setSelectedClimbLog] = useState<SelectedClimbLog | null>(null)
  const [selectedClimbRatingSummary, setSelectedClimbRatingSummary] = useState<SelectedClimbRatingSummary | null>(null)
  const [selectedClimbHasSavedFeedback, setSelectedClimbHasSavedFeedback] = useState(false)
  const [selectedClimbFeedbackCollapsed, setSelectedClimbFeedbackCollapsed] = useState(true)
  const [pendingGradeOpinion, setPendingGradeOpinion] = useState<GradeOpinion | null>(null)
  const [pendingStarRating, setPendingStarRating] = useState<number | null>(null)
  const [pendingNotes, setPendingNotes] = useState('')
  const [loadingSelectedClimbState, setLoadingSelectedClimbState] = useState(false)
  const [isWantToTrySaved, setIsWantToTrySaved] = useState(false)
  const [communityNotesCount, setCommunityNotesCount] = useState(0)
  const [communityNotes, setCommunityNotes] = useState<Array<{ userId: string; displayName: string; notes: string; createdAt: string | null }>>([])
  const [communityNotesExpanded, setCommunityNotesExpanded] = useState(false)

  useEffect(() => {
    setSelectedClimbLogged(false)
    setSelectedClimbLog(null)
    setSelectedClimbHasSavedFeedback(false)
    setSelectedClimbFeedbackCollapsed(true)
    setPendingGradeOpinion(null)
    setPendingStarRating(null)
    setPendingNotes('')
    setIsWantToTrySaved(false)
    setSelectedClimbLogged(pendingLogClimbIds.has(activeClimbId ?? ''))
    setLoadingSelectedClimbState(Boolean(activeEffectiveClimbId && userPresent))

    if (!activeClimbId || !activeEffectiveClimbId || !userPresent) return

    const supabase = createClient()
    let cancelled = false

    const fetchData = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser()
        const userId = userData.user?.id
        if (!userId) return

        const [{ data, error }, saved] = await Promise.all([
          supabase
            .from('user_climbs')
            .select('grade_opinion, star_rating, notes')
            .eq('user_id', userId)
            .eq('climb_id', activeEffectiveClimbId)
            .maybeSingle(),
          isClimbSavedByUser(supabase, userId, activeClimbId),
        ])

        if (cancelled) return

        if (!error) {
          const log = toLoggedClimbInfo(data)
          setSelectedClimbLogged(!!data || pendingLogClimbIds.has(activeClimbId))
          setSelectedClimbLog(log)
          setSelectedClimbHasSavedFeedback(!!data && (!!log?.gradeOpinion || log?.starRating !== null || !!log?.notes))
          setSelectedClimbFeedbackCollapsed(!!data)
          setPendingGradeOpinion(log?.gradeOpinion ?? null)
          setPendingStarRating(log?.starRating ?? null)
          setPendingNotes(log?.notes ?? '')
        }
        setIsWantToTrySaved(saved)
      } catch {
        // Keep the synchronously reset state when route-state requests fail.
      } finally {
        if (!cancelled) setLoadingSelectedClimbState(false)
      }
    }

    void fetchData()
    return () => { cancelled = true }
  }, [activeClimbId, activeEffectiveClimbId, pendingLogClimbIds, userPresent])

  useEffect(() => {
    if (!activeEffectiveClimbId) {
      setSelectedClimbRatingSummary(null)
      return
    }

    let cancelled = false

    const fetchRatingSummary = async () => {
      const response = await fetch(`/api/climbs/${encodeURIComponent(activeEffectiveClimbId)}/star-rating`)
      if (!response.ok) {
        if (!cancelled) setSelectedClimbRatingSummary(null)
        return
      }

      const json = await response.json() as { rating_avg?: number | null; rating_count?: number | null }
      if (cancelled) return

      setSelectedClimbRatingSummary({
        rating_avg: typeof json.rating_avg === 'number' ? json.rating_avg : null,
        rating_count: typeof json.rating_count === 'number' ? json.rating_count : 0,
      })
    }

    void fetchRatingSummary()
    return () => { cancelled = true }
  }, [activeEffectiveClimbId])

  useEffect(() => {
    if (!activeEffectiveClimbId) return

    let cancelled = false

    const fetchCommunityNotes = async () => {
      const response = await fetch(`/api/image-first/community-notes?effectiveClimbId=${encodeURIComponent(activeEffectiveClimbId)}`)
      if (!response.ok) {
        if (!cancelled) {
          setCommunityNotesCount(0)
          setCommunityNotes([])
        }
        return
      }

      const json = await response.json() as {
        notes?: Array<{ userId: string; displayName: string; notes: string; createdAt: string | null }>
      }

      if (cancelled) return

      const notes = (json.notes || []).map((note) => ({
        userId: note.userId,
        displayName: note.displayName,
        notes: note.notes,
        createdAt: note.createdAt,
      }))

      setCommunityNotesCount(notes.length)
      setCommunityNotes(notes)
      setCommunityNotesExpanded(false)
    }

    void fetchCommunityNotes()
    return () => { cancelled = true }
  }, [activeEffectiveClimbId])

  return {
    selectedClimbLogged,
    setSelectedClimbLogged,
    selectedClimbLog,
    setSelectedClimbLog,
    selectedClimbRatingSummary,
    selectedClimbHasSavedFeedback,
    setSelectedClimbHasSavedFeedback,
    selectedClimbFeedbackCollapsed,
    setSelectedClimbFeedbackCollapsed,
    pendingGradeOpinion,
    setPendingGradeOpinion,
    pendingStarRating,
    setPendingStarRating,
    pendingNotes,
    setPendingNotes,
    loadingSelectedClimbState,
    isWantToTrySaved,
    setIsWantToTrySaved,
    communityNotesCount,
    communityNotes,
    communityNotesExpanded,
    setCommunityNotesExpanded,
  }
}
