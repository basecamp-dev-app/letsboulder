-- Backfill country_id on existing crags using the ISO code
UPDATE public.crags c 
SET country_id = co.id 
FROM public.countries co 
WHERE co.iso_a2 = c.country_code 
AND c.country_id IS NULL;
