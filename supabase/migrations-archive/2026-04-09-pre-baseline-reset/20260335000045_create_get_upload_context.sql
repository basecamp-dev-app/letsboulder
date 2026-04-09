CREATE OR REPLACE FUNCTION public.get_upload_context(search_lat double precision, search_lng double precision)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
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
        ),
        'region', (
            SELECT json_build_object(
                'id', id,
                'name', name,
                'country_code', country_code,
                'center_lat', center_lat,
                'center_lon', center_lon
            )
            FROM regions 
            WHERE ST_Contains(boundary, ST_SetSRID(ST_Point(search_lng, search_lat), 4326))
            LIMIT 1
        )
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;