import { describe, expect, test } from 'vitest'

import { GET, POST } from '@/app/api/routes/submit/route'

describe('Legacy route submission endpoint', () => {
  test('POST is retired and cannot write arbitrary image URLs', async () => {
    const response = await POST()

    expect(response.status).toBe(410)
    await expect(response.json()).resolves.toEqual({
      error: 'Legacy image URL route submission has been retired',
    })
  })

  test('GET remains available', async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      message: 'Route submission endpoint',
      method: 'POST',
    })
  })
})
