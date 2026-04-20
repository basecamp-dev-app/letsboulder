import { cache } from 'react'
import { getDisplayName } from '@/lib/profile-helpers'
import { getServerClient } from '@/lib/supabase-server'

interface HomeRecentImageRow {
  id: string
  url: string
  created_at: string
  crag_id: string | null
  created_by: string | null
  crags: {
    id: string
    name: string
    slug: string | null
    country_code: string | null
  } | Array<{
    id: string
    name: string
    slug: string | null
    country_code: string | null
  }> | null
}

interface HomeProfileRow {
  id: string
  username: string | null
  display_name: string | null
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  is_public: boolean | null
  contributor_score_total: number | null
  accepted_contribution_count: number | null
}

export interface HomeRecentCragUpdate {
  cragId: string
  cragName: string
  href: string
  coverImageUrl: string
  latestContributionAt: string
  recentContributionCount: number
}

export interface HomeContributorHighlight {
  userId: string
  href: string
  displayName: string
  avatarUrl: string | null
  username: string | null
  contributedAt?: string
  contributorScoreTotal?: number
  acceptedContributionCount?: number
}

function getCragRecord(row: HomeRecentImageRow['crags']) {
  if (Array.isArray(row)) {
    return row[0] || null
  }

  return row || null
}

function buildCragHref(crag: { country_code: string | null; slug: string | null; id: string }) {
  if (crag.country_code && crag.slug) {
    return `/${crag.country_code.toLowerCase()}/${crag.slug}`
  }

  return `/crag/${crag.id}`
}

export const fetchHomepageRecentCragUpdates = cache(async function fetchHomepageRecentCragUpdates(): Promise<HomeRecentCragUpdate[]> {
  const supabase = await getServerClient()

  const { data, error } = await supabase
    .from('images')
    .select('id, url, created_at, crag_id, created_by, crags(id, name, slug, country_code)')
    .eq('moderation_status', 'approved')
    .not('crag_id', 'is', null)
    .not('url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(48)

  if (error || !data) {
    return []
  }

  const groupedUpdates = new Map<string, HomeRecentCragUpdate>()

  for (const row of data as HomeRecentImageRow[]) {
    if (!row.crag_id || !row.url) {
      continue
    }

    const crag = getCragRecord(row.crags)
    if (!crag) {
      continue
    }

    const existing = groupedUpdates.get(row.crag_id)
    if (existing) {
      existing.recentContributionCount += 1
      continue
    }

    groupedUpdates.set(row.crag_id, {
      cragId: row.crag_id,
      cragName: crag.name,
      href: buildCragHref(crag),
      coverImageUrl: row.url,
      latestContributionAt: row.created_at,
      recentContributionCount: 1,
    })
  }

  return Array.from(groupedUpdates.values()).slice(0, 6)
})

export const fetchHomepageRecentContributors = cache(async function fetchHomepageRecentContributors(): Promise<HomeContributorHighlight[]> {
  const supabase = await getServerClient()

  const { data, error } = await supabase
    .from('images')
    .select('created_at, created_by')
    .eq('moderation_status', 'approved')
    .not('created_by', 'is', null)
    .order('created_at', { ascending: false })
    .limit(36)

  if (error || !data) {
    return []
  }

  const latestContributionByUser = new Map<string, string>()
  for (const row of data as Array<{ created_at: string; created_by: string | null }>) {
    if (!row.created_by || latestContributionByUser.has(row.created_by)) {
      continue
    }

    latestContributionByUser.set(row.created_by, row.created_at)
  }

  const contributorIds = Array.from(latestContributionByUser.keys())
  if (contributorIds.length === 0) {
    return []
  }

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, display_name, first_name, last_name, avatar_url, is_public')
    .in('id', contributorIds)
    .eq('is_public', true)

  if (profileError || !profiles) {
    return []
  }

  const profileMap = new Map((profiles as HomeProfileRow[]).map((profile) => [profile.id, profile]))

  return contributorIds
    .flatMap((userId) => {
      const profile = profileMap.get(userId)
      if (!profile) {
        return []
      }

      return [{
        userId,
        href: `/logbook/${userId}`,
        displayName: getDisplayName({
          id: profile.id,
          username: profile.username,
          display_name: profile.display_name,
          first_name: profile.first_name,
          last_name: profile.last_name,
          avatar_url: profile.avatar_url,
          is_public: true,
        }),
        avatarUrl: profile.avatar_url,
        username: profile.username,
        contributedAt: latestContributionByUser.get(userId),
      } satisfies HomeContributorHighlight]
    })
    .slice(0, 6)
})

export const fetchHomepageTopContributors = cache(async function fetchHomepageTopContributors(): Promise<HomeContributorHighlight[]> {
  const supabase = await getServerClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, first_name, last_name, avatar_url, is_public, contributor_score_total, accepted_contribution_count')
    .eq('is_public', true)
    .gt('accepted_contribution_count', 0)
    .order('contributor_score_total', { ascending: false })
    .order('accepted_contribution_count', { ascending: false })
    .limit(6)

  if (error || !data) {
    return []
  }

  return (data as HomeProfileRow[]).map((profile) => ({
    userId: profile.id,
    href: `/logbook/${profile.id}`,
    displayName: getDisplayName({
      id: profile.id,
      username: profile.username,
      display_name: profile.display_name,
      first_name: profile.first_name,
      last_name: profile.last_name,
      avatar_url: profile.avatar_url,
      is_public: true,
    }),
    avatarUrl: profile.avatar_url,
    username: profile.username,
    contributorScoreTotal: profile.contributor_score_total ?? 0,
    acceptedContributionCount: profile.accepted_contribution_count ?? 0,
  }))
})
