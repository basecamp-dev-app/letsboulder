SELECT rl.image_id, ci.url, ci.width, ci.height
FROM route_lines rl
JOIN crag_images ci ON ci.id = rl.image_id
WHERE rl.climb_id = '4f8d4bed-731f-476e-bcbb-f2fb1d49cb2b';