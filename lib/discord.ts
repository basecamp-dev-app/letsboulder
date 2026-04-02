import { SupabaseClient } from '@supabase/supabase-js'
import { serverEnv } from '@/lib/env'
import { BRAND_NAME, SITE_URL } from '@/lib/site'

const DISCORD_SUBMISSIONS_WEBHOOK = serverEnv.DISCORD_SUBMISSIONS_WEBHOOK_URL
const DISCORD_FLAGS_WEBHOOK = serverEnv.DISCORD_FLAGS_WEBHOOK_URL
const DISCORD_GYM_OWNERS_WEBHOOK = serverEnv.DISCORD_GYM_OWNERS_WEBHOOK_URL

interface DiscordEmbed {
  title: string
  description?: string
  color: number
  fields?: Array<{ name: string; value: string; inline?: boolean }>
  footer?: { text: string }
  timestamp?: string
  url?: string
}

interface DiscordWebhookPayload {
  content?: string
  embeds?: DiscordEmbed[]
}

async function sendDiscordWebhook(webhookUrl: string, payload: DiscordWebhookPayload): Promise<void> {
  if (!webhookUrl) {
    console.warn('[Discord] Webhook URL not configured')
    return
  }

  const controller = new AbortController()
  const timeoutMs = 8000
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const text = await response.text()
      console.error(`[Discord] Webhook failed: ${response.status} - ${text}`)
    }
  } catch (error) {
    clearTimeout(timeoutId)
    console.error('[Discord] Webhook error:', error)
  }
}

async function getUserIdentifier(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .single()

  if (data?.id) {
    const idStr = data.id.replace(/-/g, '')
    return `User #${idStr.slice(0, 4)}...`
  }
  return 'Anonymous User'
}

export async function notifyNewSubmission(
  supabase: SupabaseClient,
  routes: Array<{ name: string; grade: string }>,
  cragName: string,
  cragId: string,
  submitterId: string
): Promise<void> {
  if (!DISCORD_SUBMISSIONS_WEBHOOK) return

  const userIdentifier = await getUserIdentifier(supabase, submitterId)

  const routeList = routes
    .slice(0, 10)
    .map(r => `• ${r.name || 'Unnamed'} - ${r.grade}`)
    .join('\n')

  const moreRoutes = routes.length > 10 ? `\n*...and ${routes.length - 10} more*` : ''

  const embed: DiscordEmbed = {
    title: '🧗 New Route Submission',
    color: 0x00ff00,
    fields: [
      { name: 'Crag', value: cragName, inline: true },
      { name: 'Routes', value: routes.length.toString(), inline: true },
      { name: 'Submitted by', value: userIdentifier, inline: true },
      { name: 'Routes', value: routeList + moreRoutes },
    ],
    footer: { text: BRAND_NAME },
    timestamp: new Date().toISOString(),
    url: `${SITE_URL}/crag/${cragId}`,
  }

  await sendDiscordWebhook(DISCORD_SUBMISSIONS_WEBHOOK, {
    content: '@moderators',
    embeds: [embed],
  })
}

interface FlagType {
  type: 'image' | 'climb' | 'crag'
  flagType: string
  targetName?: string
  cragName: string
  cragId: string
  comment: string
  flaggerId: string
}

interface GymOwnerApplicationNotificationInput {
  id: string
  gymName: string
  address: string
  city: string
  country: string
  postcodeOrZip: string
  facilities: string[]
  contactPhone: string
  contactEmail: string
  role: string
  additionalComments: string | null
  createdAt: string
}

export async function notifyNewFlag(
  supabase: SupabaseClient,
  flagInfo: FlagType
): Promise<void> {
  if (!DISCORD_FLAGS_WEBHOOK) return

  const userIdentifier = await getUserIdentifier(supabase, flagInfo.flaggerId)

  const flagTypeLabels: Record<string, string> = {
    location: '📍 Wrong Location',
    route_line: '📐 Route Line Issue',
    route_name: '🏷️ Wrong Route Name',
    image_quality: '📷 Image Quality',
    wrong_crag: '🗺️ Wrong Crag',
    boundary: '🗺️ Wrong Boundary',
    access: '🚧 Access Issue',
    description: '📝 Wrong Description',
    rock_type: '🪨 Wrong Rock Type',
    name: '🏷️ Wrong Crag Name',
    other: '⚠️ Other',
  }

  const targetDesc = flagInfo.type === 'crag'
    ? `Crag: ${flagInfo.cragName}`
    : flagInfo.type === 'climb'
    ? `"${flagInfo.targetName}" at ${flagInfo.cragName}`
    : `Image at ${flagInfo.cragName}`

  const embed: DiscordEmbed = {
    title: '🚩 New Flag',
    color: 0xff0000,
    fields: [
      { name: 'Type', value: flagTypeLabels[flagInfo.flagType] || flagInfo.flagType, inline: true },
      { name: 'Target', value: targetDesc, inline: true },
      { name: 'By', value: userIdentifier, inline: true },
      { name: 'Comment', value: flagInfo.comment.slice(0, 500) + (flagInfo.comment.length > 500 ? '...' : '') },
    ],
    footer: { text: BRAND_NAME },
    timestamp: new Date().toISOString(),
    url: `${SITE_URL}/crag/${flagInfo.cragId}`,
  }

  await sendDiscordWebhook(DISCORD_FLAGS_WEBHOOK, {
    content: '@moderators',
    embeds: [embed],
  })
}

export async function notifyGymOwnerApplication(
  input: GymOwnerApplicationNotificationInput
): Promise<void> {
  if (!DISCORD_GYM_OWNERS_WEBHOOK) return

  const facilities = input.facilities.length > 0
    ? input.facilities.map(value => value.replace('_', ' ')).join(', ')
    : 'None specified'

  const embed: DiscordEmbed = {
    title: '🏢 New Gym Owner Application',
    color: 0x2563eb,
    fields: [
      { name: 'Application ID', value: input.id, inline: false },
      { name: 'Gym', value: input.gymName, inline: true },
      { name: 'Role', value: input.role.replace('_', ' '), inline: true },
      { name: 'Facilities', value: facilities, inline: false },
      { name: 'Address', value: input.address, inline: false },
      { name: 'City', value: input.city, inline: true },
      { name: 'Country', value: input.country, inline: true },
      { name: 'Postcode / ZIP', value: input.postcodeOrZip, inline: true },
      { name: 'Phone', value: input.contactPhone, inline: true },
      { name: 'Email', value: input.contactEmail, inline: true },
      {
        name: 'Additional comments',
        value: input.additionalComments && input.additionalComments.length > 0
          ? input.additionalComments.slice(0, 1000)
          : 'None',
        inline: false,
      },
    ],
    footer: { text: BRAND_NAME },
    timestamp: input.createdAt,
  }

  await sendDiscordWebhook(DISCORD_GYM_OWNERS_WEBHOOK, {
    embeds: [embed],
  })
}
