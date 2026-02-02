-- Preview: Check how many climbs will be affected
SELECT COUNT(*) 
FROM climbs c
WHERE c.route_type = 'sport'
  AND EXISTS (SELECT 1 FROM route_lines rl WHERE rl.climb_id = c.id);
