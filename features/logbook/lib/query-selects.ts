export const DETAILED_LOGBOOK_SELECT = 'id, climb_id, style, created_at, date_climbed, climbs(id, name, grade, slug, crag_id, route_lines(images(url, crags!images_crag_id_fkey(name))))'

export const PUBLIC_DETAILED_LOGBOOK_SELECT = '*, climbs(id, name, grade, route_lines(images(url, crags!images_crag_id_fkey(name))))'
