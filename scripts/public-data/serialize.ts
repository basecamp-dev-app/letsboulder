type JsonPrimitive = string | number | boolean | null

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }

type FieldKind = 'string' | 'nullable-string' | 'number' | 'nullable-number' | 'boolean' | 'nullable-boolean'

type FieldDefinition = {
  source: string
  output?: string
  kind: FieldKind
  required?: boolean
}

const CRAG_FIELDS: FieldDefinition[] = [
  { source: 'id', kind: 'string', required: true },
  { source: 'name', kind: 'string', required: true },
  { source: 'slug', kind: 'string', required: true },
  { source: 'country_code', kind: 'string', required: true },
  { source: 'country_id', kind: 'nullable-string', required: true },
  { source: 'country', kind: 'nullable-string', required: true },
  { source: 'region_id', kind: 'nullable-string', required: true },
  { source: 'region_name', kind: 'nullable-string', required: true },
  { source: 'sub_area', kind: 'nullable-string', required: true },
  { source: 'rock_type', kind: 'nullable-string', required: true },
  { source: 'type', kind: 'nullable-string', required: true },
  { source: 'tide_dependency', kind: 'nullable-string', required: true },
  { source: 'location_visibility', kind: 'string', required: true },
  { source: 'latitude', kind: 'nullable-number', required: true },
  { source: 'longitude', kind: 'nullable-number', required: true },
  { source: 'created_at', kind: 'nullable-string', required: true },
  { source: 'updated_at', kind: 'nullable-string', required: true },
]

const ROUTE_FIELDS: FieldDefinition[] = [
  { source: 'id', kind: 'string', required: true },
  { source: 'effective_climb_id', kind: 'string', required: true },
  { source: 'crag_id', kind: 'string', required: true },
  { source: 'sector_id', kind: 'nullable-string', required: true },
  { source: 'shared_climb_id', kind: 'nullable-string', required: true },
  { source: 'name', kind: 'nullable-string', required: true },
  { source: 'slug', kind: 'nullable-string', required: true },
  { source: 'grade', kind: 'string', required: true },
  { source: 'grade_index', kind: 'nullable-number', required: true },
  { source: 'consensus_grade', kind: 'nullable-string', required: true },
  { source: 'original_grade_string', kind: 'nullable-string', required: true },
  { source: 'route_type', kind: 'nullable-string', required: true },
  { source: 'location_visibility', kind: 'string', required: true },
  { source: 'latitude', kind: 'nullable-number', required: true },
  { source: 'longitude', kind: 'nullable-number', required: true },
  { source: 'is_verified', kind: 'nullable-boolean', required: true },
  { source: 'verification_count', kind: 'nullable-number', required: true },
  { source: 'created_at', kind: 'nullable-string', required: true },
  { source: 'updated_at', kind: 'nullable-string', required: true },
]

const SECTOR_FIELDS: FieldDefinition[] = [
  { source: 'id', kind: 'string', required: true },
  { source: 'crag_id', kind: 'string', required: true },
  { source: 'name', kind: 'string', required: true },
  { source: 'created_at', kind: 'string', required: true },
]

const TOMBSTONE_FIELDS: FieldDefinition[] = [
  { source: 'entity_type', kind: 'string', required: true },
  { source: 'id', kind: 'string', required: true },
  { source: 'deleted_at', kind: 'string', required: true },
  { source: 'superseded_by', kind: 'nullable-string', required: true },
]

const ROUTE_LINE_FIELDS: FieldDefinition[] = [
  { source: 'id', kind: 'string', required: true },
  { source: 'climb_id', kind: 'string', required: true },
  { source: 'sequence_order', kind: 'nullable-number', required: true },
  { source: 'color', kind: 'nullable-string', required: true },
  { source: 'image_width', kind: 'nullable-number', required: true },
  { source: 'image_height', kind: 'nullable-number', required: true },
  { source: 'created_at', kind: 'nullable-string', required: true },
]

export type ExportView = 'crags' | 'routes' | 'route_lines' | 'sectors' | 'tombstones'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValueOfKind(value: unknown, kind: FieldKind): value is JsonPrimitive {
  if (kind.startsWith('nullable-') && value === null) return true
  const baseKind = kind.replace('nullable-', '')
  return typeof value === baseKind && (baseKind !== 'number' || Number.isFinite(value))
}

function mapFields(value: unknown, fields: FieldDefinition[], label: string): JsonObject {
  if (!isRecord(value)) throw new Error(`${label} row must be an object`)

  const output: JsonObject = {}
  for (const field of fields) {
    const fieldValue = value[field.source]
    if (fieldValue === undefined) {
      if (field.required) throw new Error(`${label}.${field.source} is required`)
      continue
    }
    if (!isValueOfKind(fieldValue, field.kind)) {
      throw new Error(`${label}.${field.source} has an invalid value`)
    }
    output[field.output ?? field.source] = fieldValue
  }
  return output
}

type Point = { x: number; y: number }

function parsePoints(value: unknown): Point[] {
  if (!Array.isArray(value) || value.length < 2) {
    throw new Error('route_line.points must contain at least two points')
  }
  return value.map((point, index) => {
    if (!isRecord(point) || typeof point.x !== 'number' || !Number.isFinite(point.x)
      || typeof point.y !== 'number' || !Number.isFinite(point.y)) {
      throw new Error(`route_line.points[${index}] must contain finite x and y numbers`)
    }
    return { x: point.x, y: point.y }
  })
}

export function normalizeRouteLine(value: unknown): JsonObject {
  if (!isRecord(value)) throw new Error('route_line row must be an object')
  const output = mapFields(value, ROUTE_LINE_FIELDS, 'route_line')
  const points = parsePoints(value.points)
  const normalized = points.every(({ x, y }) => x >= 0 && x <= 1 && y >= 0 && y <= 1)

  if (normalized) {
    output.points = points.map(({ x, y }) => ({ x, y }))
    output.points_normalized = points.map(({ x, y }) => ({ x, y }))
    output.source_coordinate_system = 'normalized'
    return output
  }

  output.points = points.map(({ x, y }) => ({ x, y }))
  output.points_normalized = null
  output.source_coordinate_system = 'legacy_image_space'
  return output
}

export function serializeViewRow(view: ExportView, value: unknown): JsonObject {
  if (view === 'route_lines') return normalizeRouteLine(value)
  const definitions: Record<Exclude<ExportView, 'route_lines'>, FieldDefinition[]> = {
    crags: CRAG_FIELDS,
    routes: ROUTE_FIELDS,
    sectors: SECTOR_FIELDS,
    tombstones: TOMBSTONE_FIELDS,
  }
  const output = mapFields(value, definitions[view], view.slice(0, -1))
  if ((view === 'crags' || view === 'routes')
    && !['exact', 'approximate', 'hidden'].includes(String(output.location_visibility))) {
    throw new Error(`${view.slice(0, -1)}.location_visibility has an invalid value`)
  }
  if (view === 'tombstones' && !['crag', 'route'].includes(String(output.entity_type))) {
    throw new Error('tombstone.entity_type has an invalid value')
  }
  return output
}

export function cragToGeoJsonFeature(value: unknown): JsonObject | null {
  const crag = serializeViewRow('crags', value)
  const latitude = crag.latitude
  const longitude = crag.longitude
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) return null
  if (typeof latitude !== 'number' || typeof longitude !== 'number'
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new Error('crag coordinates must be valid EPSG:4326 latitude and longitude')
  }

  const properties = { ...crag }
  delete properties.latitude
  delete properties.longitude
  return {
    type: 'Feature',
    id: crag.id,
    geometry: { type: 'Point', coordinates: [longitude, latitude] },
    properties,
  }
}
