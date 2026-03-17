-- Migration: Fix get_upload_context RPC for full atlas hierarchy
-- Date: 2026-03-16
-- Purpose: Return complete hierarchy (Country, Admin Region, UN Region, Continent) via ST_Covers

CREATE OR REPLACE FUNCTION public.get_upload_context(search_lat double precision, search_lng double precision)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'continent', (
            SELECT json_build_object(
                'name', u.continent_name
            )
            FROM countries c
            JOIN regions r ON c.region_id = r.id
            JOIN un_regions u ON r.un_region_name = u.name
            WHERE ST_Covers(c.boundary, ST_SetSRID(ST_Point(search_lng, search_lat), 4326))
            LIMIT 1
        ),
        'un_region', (
            SELECT json_build_object(
                'name', r.un_region_name,
                'continent_name', u.continent_name
            )
            FROM countries c
            JOIN regions r ON c.region_id = r.id
            JOIN un_regions u ON r.un_region_name = u.name
            WHERE ST_Covers(c.boundary, ST_SetSRID(ST_Point(search_lng, search_lat), 4326))
            LIMIT 1
        ),
        'region', (
            SELECT json_build_object(
                'name', r.name,
                'country_code', c.iso_a2
            )
            FROM countries c
            JOIN regions r ON c.region_id = r.id
            WHERE ST_Covers(c.boundary, ST_SetSRID(ST_Point(search_lng, search_lat), 4326))
            LIMIT 1
        ),
        'country', (
            SELECT json_build_object(
                'id', id,
                'name', name,
                'iso_a2', iso_a2
            )
            FROM countries 
            WHERE ST_Covers(boundary, ST_SetSRID(ST_Point(search_lng, search_lat), 4326))
            LIMIT 1
        ),
        'crag', (
            SELECT json_build_object(
                'id', id,
                'name', name,
                'distance_meters', ST_Distance(location, ST_MakePoint(search_lng, search_lat)::geography)
            )
            FROM crags 
            WHERE ST_DWithin(location, ST_MakePoint(search_lng, search_lat)::geography, 150)
            ORDER BY location <-> ST_MakePoint(search_lng, search_lat)::geography ASC
            LIMIT 1
        )
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;
