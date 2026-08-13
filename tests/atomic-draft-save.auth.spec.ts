import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import { expect, test, type Browser, type BrowserContext } from '@playwright/test'

import type { Json } from '@/types/database'
import { supabaseAdmin } from './utils/supabase-admin'

const OWNER_ID = process.env.TEST_USER_ID?.trim() || ''
const OWNER_EMAIL = process.env.TEST_USER_EMAIL?.trim() || 'e2e-auth@example.com'
const IMAGE_FIXTURE = path.join(__dirname, 'fixtures/IMG-20260223-WA0006~2.jpg')
const STORAGE_BUCKET = 'e2e-draft-images'
const SHARED_LATITUDE = 49.2011
const SHARED_LONGITUDE = -2.1211
const CUSTOM_LATITUDE = 49.2022
const CUSTOM_LONGITUDE = -2.1222
const OPEN_DATA_CONSENT_VERSION = '2026-07-29-v1'

type DraftMetadata = {
  version: 2
  navigation: { defaultImageId: string }
  images: Record<string, {
    imageId: string
    displayOrder: number
    orientation: string[]
    locationMode: 'shared' | 'custom'
    gps: { latitude: number | null; longitude: number | null }
  }>
  submission: {
    routeType: string
    location: { latitude: number; longitude: number; countryCode: string; countryName: string }
    isAnonymousSubmission: boolean
    contributionCreditPlatform: null
    contributionCreditHandle: null
    sectorId: null
    canvasSource: null
  }
}

interface Fixture {
  collaboratorId: string
  draftId: string
  firstDraftImageId: string
  firstImageId: string
  firstRouteId: string
  retainedRouteId: string
  secondCragId: string
  secondDraftImageId: string
  secondImageId: string
  secondRouteId: string
  staleRevision: string
  storagePaths: string[]
}

interface AtomicSaveBody {
  cragId: string | null
  expected_updated_at: string
  images: Array<{ id: string; display_order: number; route_data?: unknown }>
  metadata: Record<string, unknown>
  routeSets: Array<{ draftImageId: string; routes: unknown }>
}

function metadataFor(firstDraftImageId: string, secondDraftImageId: string): DraftMetadata {
  return {
    version: 2,
    navigation: { defaultImageId: firstDraftImageId },
    images: {
      [firstDraftImageId]: {
        imageId: firstDraftImageId,
        displayOrder: 0,
        orientation: [],
        locationMode: 'shared',
        gps: { latitude: null, longitude: null },
      },
      [secondDraftImageId]: {
        imageId: secondDraftImageId,
        displayOrder: 1,
        orientation: [],
        locationMode: 'shared',
        gps: { latitude: null, longitude: null },
      },
    },
    submission: {
      routeType: 'sport',
      location: {
        latitude: SHARED_LATITUDE,
        longitude: SHARED_LONGITUDE,
        countryCode: 'GG',
        countryName: 'Guernsey',
      },
      isAnonymousSubmission: false,
      contributionCreditPlatform: null,
      contributionCreditHandle: null,
      sectorId: null,
      canvasSource: null,
    },
  }
}

async function requireSuccess(label: string, error: { message: string } | null) {
  if (error) throw new Error(`${label}: ${error.message}`)
}

async function createFixture(): Promise<Fixture> {
  if (!OWNER_ID) throw new Error('TEST_USER_ID is required for authenticated draft verification')

  const collaboratorId = randomUUID()
  const draftId = randomUUID()
  const firstDraftImageId = randomUUID()
  const secondDraftImageId = randomUUID()
  const firstImageId = randomUUID()
  const secondImageId = randomUUID()
  const firstRouteId = randomUUID()
  const retainedRouteId = randomUUID()
  const secondRouteId = randomUUID()
  const firstCragId = randomUUID()
  const secondCragId = randomUUID()
  const suffix = draftId.slice(0, 8)
  const storagePaths = [
    `${OWNER_ID}/atomic-draft/${firstImageId}.jpg`,
    `${OWNER_ID}/atomic-draft/${secondImageId}.jpg`,
  ]

  await supabaseAdmin.auth.admin.deleteUser(collaboratorId).catch(() => undefined)
  await requireSuccess('refresh owner credentials', (await supabaseAdmin.auth.admin.updateUserById(OWNER_ID, {
    email: OWNER_EMAIL,
    password: process.env.TEST_USER_PASSWORD,
    email_confirm: true,
  })).error)
  await requireSuccess('create collaborator', (await supabaseAdmin.auth.admin.createUser({
    id: collaboratorId,
    email: `e2e-collaborator-${suffix}@example.test`,
    password: process.env.TEST_USER_PASSWORD,
    email_confirm: true,
  })).error)

  await requireSuccess('upsert profiles', (await supabaseAdmin.from('profiles').upsert([
    {
      id: OWNER_ID,
      email: OWNER_EMAIL,
      username: `e2e-owner-${suffix}`,
      display_name: 'E2E Draft Owner',
      open_data_consent_version: OPEN_DATA_CONSENT_VERSION,
      consent_timestamp: new Date().toISOString(),
    },
    {
      id: collaboratorId,
      email: `e2e-collaborator-${suffix}@example.test`,
      username: `e2e-collaborator-${suffix}`,
      display_name: 'E2E Draft Collaborator',
      open_data_consent_version: OPEN_DATA_CONSENT_VERSION,
      consent_timestamp: new Date().toISOString(),
    },
  ])).error)

  await supabaseAdmin.storage.createBucket(STORAGE_BUCKET, { public: false }).catch(() => undefined)
  const imageBytes = fs.readFileSync(IMAGE_FIXTURE)
  for (const storagePath of storagePaths) {
    await requireSuccess('upload image fixture', (await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, imageBytes, { contentType: 'image/jpeg', upsert: true })).error)
  }

  await requireSuccess('insert crags', (await supabaseAdmin.from('crags').insert([
    {
      id: firstCragId,
      name: `Atomic Source Crag ${suffix}`,
      slug: `atomic-source-crag-${suffix}`,
      type: 'boulder',
      country: 'Guernsey',
      country_code: 'GG',
      latitude: SHARED_LATITUDE,
      longitude: SHARED_LONGITUDE,
    },
    {
      id: secondCragId,
      name: `Atomic Saved Crag ${suffix}`,
      slug: `atomic-saved-crag-${suffix}`,
      type: 'boulder',
      country: 'Guernsey',
      country_code: 'GG',
      latitude: SHARED_LATITUDE,
      longitude: SHARED_LONGITUDE,
    },
  ])).error)

  await requireSuccess('insert linked images', (await supabaseAdmin.from('images').insert([
    {
      id: firstImageId,
      url: `/storage/v1/object/${STORAGE_BUCKET}/${storagePaths[0]}`,
      created_by: OWNER_ID,
      width: 1200,
      height: 900,
      storage_provider: 'supabase',
      storage_bucket: STORAGE_BUCKET,
      storage_path: storagePaths[0],
      original_bucket: STORAGE_BUCKET,
      original_key: storagePaths[0],
      processing_status: 'ready',
      moderation_status: 'skipped',
      visibility: 'public',
      status: 'approved',
      processed_at: new Date().toISOString(),
    },
    {
      id: secondImageId,
      url: `/storage/v1/object/${STORAGE_BUCKET}/${storagePaths[1]}`,
      created_by: OWNER_ID,
      width: 1200,
      height: 900,
      storage_provider: 'supabase',
      storage_bucket: STORAGE_BUCKET,
      storage_path: storagePaths[1],
      original_bucket: STORAGE_BUCKET,
      original_key: storagePaths[1],
      processing_status: 'ready',
      moderation_status: 'skipped',
      visibility: 'public',
      status: 'approved',
      processed_at: new Date().toISOString(),
    },
  ])).error)

  await requireSuccess('insert draft', (await supabaseAdmin.from('submission_drafts').insert({
    id: draftId,
    user_id: OWNER_ID,
    crag_id: firstCragId,
    metadata: metadataFor(firstDraftImageId, secondDraftImageId) as unknown as Json,
    last_edited_by: OWNER_ID,
  })).error)
  await requireSuccess('insert collaborator', (await supabaseAdmin.from('submission_draft_collaborators').insert({
    draft_id: draftId,
    user_id: collaboratorId,
    created_by: OWNER_ID,
  })).error)
  await requireSuccess('insert draft images', (await supabaseAdmin.from('submission_draft_images').insert([
    {
      id: firstDraftImageId,
      draft_id: draftId,
      display_order: 0,
      storage_provider: 'supabase',
      storage_bucket: STORAGE_BUCKET,
      storage_path: storagePaths[0],
      linked_image_id: firstImageId,
      processing_status: 'ready',
      width: 1200,
      height: 900,
      route_data: {},
    },
    {
      id: secondDraftImageId,
      draft_id: draftId,
      display_order: 1,
      storage_provider: 'supabase',
      storage_bucket: STORAGE_BUCKET,
      storage_path: storagePaths[1],
      linked_image_id: secondImageId,
      processing_status: 'ready',
      width: 1200,
      height: 900,
      route_data: {},
    },
  ])).error)
  await requireSuccess('insert draft routes', (await supabaseAdmin.from('submission_draft_routes').insert([
    {
      id: firstRouteId,
      draft_id: draftId,
      draft_image_id: firstDraftImageId,
      name: 'Route to keep',
      grade: '6A',
      description: 'Before save',
      climb_type: 'sport',
      points: [{ x: 0.2, y: 0.8 }, { x: 0.65, y: 0.2 }],
      sequence_order: 0,
      image_width: 1200,
      image_height: 900,
      created_by: OWNER_ID,
      updated_by: OWNER_ID,
    },
    {
      id: secondRouteId,
      draft_id: draftId,
      draft_image_id: firstDraftImageId,
      name: 'Route to delete',
      grade: '6B',
      description: 'Must not return',
      climb_type: 'boulder',
      points: [{ x: 0.25, y: 0.85 }, { x: 0.7, y: 0.15 }],
      sequence_order: 1,
      image_width: 1200,
      image_height: 900,
      created_by: OWNER_ID,
      updated_by: OWNER_ID,
    },
    {
      id: retainedRouteId,
      draft_id: draftId,
      draft_image_id: firstDraftImageId,
      name: 'Route to reorder',
      grade: '6C',
      description: 'Retained after save',
      climb_type: 'sport',
      points: [{ x: 0.3, y: 0.9 }, { x: 0.75, y: 0.1 }],
      sequence_order: 2,
      image_width: 1200,
      image_height: 900,
      created_by: OWNER_ID,
      updated_by: OWNER_ID,
    },
  ])).error)

  const { data: draft, error: draftError } = await supabaseAdmin
    .from('submission_drafts')
    .select('updated_at')
    .eq('id', draftId)
    .single()
  await requireSuccess('read draft revision', draftError)
  if (!draft) throw new Error('Draft revision query returned no row')

  return {
    collaboratorId,
    draftId,
    firstDraftImageId,
    firstImageId,
    firstRouteId,
    retainedRouteId,
    secondCragId,
    secondDraftImageId,
    secondImageId,
    secondRouteId,
    staleRevision: draft.updated_at,
    storagePaths,
  }
}

async function authenticateContext(browser: Browser, userId: string): Promise<BrowserContext> {
  const context = await browser.newContext()
  const segment = process.env.TEST_AUTH_PATH_SEGMENT?.trim()
  const apiKey = process.env.TEST_API_KEY?.trim()
  const internalKey = process.env.INTERNAL_TEST_KEY?.trim()
  if (!segment || !apiKey || !internalKey) throw new Error('Local test auth environment is incomplete')

  const response = await context.request.post(`http://localhost:3000/api/test/${segment}/auth`, {
    headers: {
      'content-type': 'application/json',
      'x-test-auth': '1',
      'x-internal-test-key': internalKey,
    },
    data: { api_key: apiKey, user_id: userId },
  })
  if (!response.ok()) throw new Error(`Collaborator authentication failed with HTTP ${response.status()}`)
  return context
}

async function csrfPatch(context: BrowserContext, draftId: string, body: AtomicSaveBody) {
  const csrfResponse = await context.request.get('http://localhost:3000/api/csrf')
  if (!csrfResponse.ok()) throw new Error(`CSRF setup failed with HTTP ${csrfResponse.status()}`)
  const csrfPayload = await csrfResponse.json() as { token?: unknown }
  if (typeof csrfPayload.token !== 'string') throw new Error('CSRF setup returned no token')
  return context.request.patch(`http://localhost:3000/api/submissions/drafts/${draftId}`, {
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfPayload.token },
    data: body,
  })
}

test.describe.serial('atomic explicit draft save verification', () => {
  let fixture: Fixture

  test.beforeAll(async () => {
    fixture = await createFixture()
  })

  test.afterAll(async () => {
    if (!fixture) return
    await supabaseAdmin.auth.admin.deleteUser(fixture.collaboratorId)
    await supabaseAdmin.storage.from(STORAGE_BUCKET).remove(fixture.storagePaths)
  })

  test('owner save is durable, stale collaborator conflicts, and publication preserves coordinates', async ({ browser }) => {
    test.setTimeout(180_000)
    const ownerContext = await authenticateContext(browser, OWNER_ID)
    let page = await ownerContext.newPage()

    await page.goto(`/logbook/drafts/${fixture.draftId}/edit`)
    await expect(page).not.toHaveURL(/\/auth/)
    await expect(page.getByRole('button', { name: 'Save draft' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('button', { name: 'Switch to image 1' })).toBeVisible({ timeout: 20_000 })
    await page.close()

    const savedMetadata = metadataFor(fixture.firstDraftImageId, fixture.secondDraftImageId)
    savedMetadata.navigation.defaultImageId = fixture.secondDraftImageId
    savedMetadata.images[fixture.secondDraftImageId] = {
      imageId: fixture.secondDraftImageId,
      displayOrder: 0,
      orientation: ['E'],
      locationMode: 'custom',
      gps: { latitude: CUSTOM_LATITUDE, longitude: CUSTOM_LONGITUDE },
    }
    savedMetadata.images[fixture.firstDraftImageId] = {
      imageId: fixture.firstDraftImageId,
      displayOrder: 1,
      orientation: ['N'],
      locationMode: 'shared',
      gps: { latitude: null, longitude: null },
    }
    savedMetadata.submission.routeType = 'trad'
    const currentDraftResponse = await ownerContext.request.get(`http://localhost:3000/api/submissions/drafts/${fixture.draftId}`)
    expect(currentDraftResponse.status()).toBe(200)
    const currentDraftPayload = await currentDraftResponse.json() as { draft?: { updated_at?: unknown } }
    if (typeof currentDraftPayload.draft?.updated_at !== 'string') throw new Error('Current draft revision is missing')
    const savedBody: AtomicSaveBody = {
      expected_updated_at: currentDraftPayload.draft.updated_at,
      cragId: fixture.secondCragId,
      images: [
        { id: fixture.secondDraftImageId, display_order: 0, route_data: {} },
        { id: fixture.firstDraftImageId, display_order: 1, route_data: {} },
      ],
      metadata: savedMetadata as unknown as Record<string, unknown>,
      routeSets: [{
        draftImageId: fixture.firstDraftImageId,
        routes: [
          {
            id: fixture.retainedRouteId,
            name: 'Reordered route',
            grade: '6C',
            description: 'First after explicit save',
            climbType: 'trad',
            points: [{ x: 0.3, y: 0.9 }, { x: 0.75, y: 0.1 }],
            sequenceOrder: 0,
            imageWidth: 1200,
            imageHeight: 900,
          },
          {
            id: fixture.firstRouteId,
            name: 'Saved route',
            grade: '6A',
            description: 'Persisted by explicit save',
            climbType: 'trad',
            points: [{ x: 0.2, y: 0.8 }, { x: 0.65, y: 0.2 }],
            sequenceOrder: 1,
            imageWidth: 1200,
            imageHeight: 900,
          },
        ],
      }],
    }
    const saveResponse = await csrfPatch(ownerContext, fixture.draftId, savedBody)
    const savePayload = await saveResponse.json()
    expect(saveResponse.status(), JSON.stringify(savePayload)).toBe(200)
    expect(savePayload).toMatchObject({ success: true })

    page = await ownerContext.newPage()
    await page.goto(`/logbook/drafts/${fixture.draftId}/edit`)
    await expect(page).not.toHaveURL(/\/auth/)
    await expect(page.getByRole('button', { name: 'Switch to image 2' })).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: 'Switch to image 2' }).click()
    await expect(page.locator('button[aria-label="Select route Saved route"]')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('button[aria-label="Select route Reordered route"]')).toBeVisible()
    await expect(page.getByRole('button', { name: /Route to delete/ })).toHaveCount(0)
    await expect(page.getByText(`Atomic Saved Crag ${fixture.draftId.slice(0, 8)}`)).toBeVisible()
    await expect(page.getByLabel('Route type')).toHaveValue('trad')
    await expect(page.getByRole('button', { name: 'Switch to image 1' })).toHaveAttribute('data-image-id', fixture.secondDraftImageId)
    await expect(page.getByRole('button', { name: 'Switch to image 2' })).toHaveAttribute('data-image-id', fixture.firstDraftImageId)
    await page.getByRole('button', { name: 'Switch to image 1' }).click()
    await expect(page.getByRole('button', { name: 'This image only' })).toHaveAttribute('class', /bg-blue-600/)
    await expect(page.getByLabel('Latitude')).toHaveValue(String(CUSTOM_LATITUDE))
    await expect(page.getByLabel('Longitude')).toHaveValue(String(CUSTOM_LONGITUDE))
    await page.getByRole('button', { name: 'Switch to image 2' }).click()
    await expect(page.getByRole('button', { name: 'Submission location' })).toHaveAttribute('class', /bg-blue-600/)
    await expect(page.getByLabel('Latitude')).toHaveValue(String(SHARED_LATITUDE))
    await expect(page.getByLabel('Longitude')).toHaveValue(String(SHARED_LONGITUDE))

    const collaboratorContext = await authenticateContext(browser, fixture.collaboratorId)
    try {
      const conflictResponse = await csrfPatch(collaboratorContext, fixture.draftId, {
        ...savedBody,
        expected_updated_at: fixture.staleRevision,
      })
      expect(conflictResponse.status()).toBe(409)
      await expect(conflictResponse.json()).resolves.toMatchObject({
        code: 'draft_conflict',
        message: 'This draft was updated by another collaborator. Reload to continue editing.',
        current_data: {
          last_updated_by: OWNER_ID,
          last_updated_by_display_name: 'E2E Draft Owner',
        },
      })
    } finally {
      await collaboratorContext.close()
    }

    await page.getByRole('button', { name: 'Publish' }).click()
    await expect(page).toHaveURL(/\/[a-z]{2}\/.+\/i\/[0-9a-f-]+/i, { timeout: 30_000 })

    const { data: draft, error: draftError } = await supabaseAdmin
      .from('submission_drafts')
      .select('status, crag_id, metadata')
      .eq('id', fixture.draftId)
      .single()
    await requireSuccess('read published draft', draftError)
    if (!draft) throw new Error('Published draft query returned no row')
    expect(draft.status).toBe('submitted')
    expect(draft.crag_id).toBe(fixture.secondCragId)

    const { data: routes, error: routeError } = await supabaseAdmin
      .from('submission_draft_routes')
      .select('id, name, description, climb_type, sequence_order')
      .eq('draft_id', fixture.draftId)
      .order('sequence_order')
    await requireSuccess('read saved routes', routeError)
    expect(routes).toEqual([
      {
        id: fixture.retainedRouteId,
        name: 'Reordered route',
        description: 'First after explicit save',
        climb_type: 'trad',
        sequence_order: 0,
      },
      {
        id: fixture.firstRouteId,
        name: 'Saved route',
        description: 'Persisted by explicit save',
        climb_type: 'trad',
        sequence_order: 1,
      },
    ])

    const { data: images, error: imageError } = await supabaseAdmin
      .from('images')
      .select('id, latitude, longitude, location_mode, face_order')
      .in('id', [fixture.firstImageId, fixture.secondImageId])
      .order('face_order')
    await requireSuccess('read published images', imageError)
    expect(images).toEqual([
      {
        id: fixture.secondImageId,
        latitude: CUSTOM_LATITUDE,
        longitude: CUSTOM_LONGITUDE,
        location_mode: 'custom',
        face_order: 0,
      },
      {
        id: fixture.firstImageId,
        latitude: SHARED_LATITUDE,
        longitude: SHARED_LONGITUDE,
        location_mode: 'shared',
        face_order: 1,
      },
    ])
    await ownerContext.close()
  })
})
