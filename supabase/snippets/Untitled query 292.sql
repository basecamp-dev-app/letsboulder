SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'images' 
  AND column_name IN ('natural_width', 'natural_height')
ORDER BY column_name;