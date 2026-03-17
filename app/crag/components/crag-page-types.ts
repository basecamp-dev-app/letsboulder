export interface BreadcrumbItem {
  label: string
  href?: string
}

export interface CragPageServerCrag {
  id: string
  name: string
  slug: string | null
  country_id?: string | null
  country_code: string | null
  region_name?: string | null
  sub_area?: string | null
  country?: string | null
  country_name?: string | null
  admin_region_name?: string | null
  un_region_name?: string | null
  continent_name?: string | null
  latitude: number | null
  longitude: number | null
  description: string | null
  access_notes: string | null
  rock_type: string | null
  type: string | null
}
