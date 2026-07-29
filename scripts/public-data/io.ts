import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'

import { JsonObject } from '@/scripts/public-data/serialize'

export type ArtifactMetadata = {
  path: string
  media_type: string
  compression: 'gzip' | 'none'
  rows: number
  bytes: number
  sha256: string
}

export async function writeGzipChunks(
  filePath: string,
  chunks: AsyncIterable<string>,
  rowCount: () => number,
): Promise<Omit<ArtifactMetadata, 'path' | 'media_type'>> {
  const gzip = createGzip({ level: 9 })
  const hash = createHash('sha256')
  let bytes = 0
  const measure = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk)
      bytes += chunk.length
      callback(null, chunk)
    },
  })
  await pipeline(Readable.from(chunks), gzip, measure, createWriteStream(filePath, { flags: 'wx' }))

  return { compression: 'gzip', rows: rowCount(), bytes, sha256: hash.digest('hex') }
}

export async function writeJsonlGzip(
  filePath: string,
  rows: AsyncIterable<unknown>,
  serializer: (row: unknown) => JsonObject,
): Promise<Omit<ArtifactMetadata, 'path' | 'media_type'>> {
  let count = 0
  async function* chunks() {
    for await (const row of rows) {
      yield `${JSON.stringify(serializer(row))}\n`
      count += 1
    }
  }
  return writeGzipChunks(filePath, chunks(), () => count)
}

export async function writeGeoJsonGzip(
  filePath: string,
  rows: AsyncIterable<unknown>,
  featureSerializer: (row: unknown) => JsonObject | null,
): Promise<Omit<ArtifactMetadata, 'path' | 'media_type'>> {
  let count = 0
  async function* chunks() {
    yield '{"type":"FeatureCollection","features":['
    let first = true
    for await (const row of rows) {
      const feature = featureSerializer(row)
      if (feature === null) continue
      yield `${first ? '' : ','}${JSON.stringify(feature)}`
      first = false
      count += 1
    }
    yield ']}\n'
  }
  return writeGzipChunks(filePath, chunks(), () => count)
}

export async function sha256File(filePath: string): Promise<{ bytes: number; sha256: string }> {
  const hash = createHash('sha256')
  const stream = createReadStream(filePath)
  for await (const chunk of stream) hash.update(chunk)
  return { bytes: (await stat(filePath)).size, sha256: hash.digest('hex') }
}
