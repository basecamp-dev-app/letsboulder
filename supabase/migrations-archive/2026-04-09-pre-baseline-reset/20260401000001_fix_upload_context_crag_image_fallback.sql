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
        'country_intersects', (
            SELECT json_build_object(
                'id', id,
                'name', name,
                'iso_a2', iso_a2
            )
            FROM countries
            WHERE ST_Intersects(boundary, ST_SetSRID(ST_Point(search_lng, search_lat), 4326))
              AND NOT ST_Covers(boundary, ST_SetSRID(ST_Point(search_lng, search_lat), 4326))
            LIMIT 1
        ),
        'crag', (
            SELECT COALESCE(
                (
                    SELECT json_build_object(
                        'id', c.id,
                        'name', c.name,
                        'distance_meters', ST_Distance(c.location, ST_MakePoint(search_lng, search_lat)::geography)
                    )
                    FROM crags c
                    WHERE ST_DWithin(c.location, ST_MakePoint(search_lng, search_lat)::geography, 150)
                    ORDER BY c.location <-> ST_MakePoint(search_lng, search_lat)::geography ASC
                    LIMIT 1
                ),
                (
                    SELECT json_build_object(
                        'id', fallback.crag_id,
                        'name', fallback.crag_name,
                        'distance_meters', fallback.closest_image_distance_meters
                    )
                    FROM (
                        SELECT
                            ci.crag_id,
                            c.name AS crag_name,
                            MIN(
                                ST_Distance(
                                    ST_MakePoint(ci.longitude, ci.latitude)::geography,
                                    ST_MakePoint(search_lng, search_lat)::geography
                                )
                            ) AS closest_image_distance_meters,
                            COUNT(*) AS nearby_image_count
                        FROM crag_images ci
                        JOIN crags c ON c.id = ci.crag_id
                        WHERE ci.latitude IS NOT NULL
                          AND ci.longitude IS NOT NULL
                          AND ST_DWithin(
                              ST_MakePoint(ci.longitude, ci.latitude)::geography,
                              ST_MakePoint(search_lng, search_lat)::geography,
                              50
                          )
                        GROUP BY ci.crag_id, c.name
                        ORDER BY closest_image_distance_meters ASC, nearby_image_count DESC, c.name ASC
                        LIMIT 1
                    ) AS fallback
                )
            )
        )
    ) INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;
