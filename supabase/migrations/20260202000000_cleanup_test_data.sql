-- Delete test data without country codes and orphaned climbs
-- ================================================================

-- Delete orphaned climbs (no crag_id - cannot have SEO-friendly URLs)
-- These climbs cannot be linked to any crag, so they serve no purpose
DELETE FROM public.climbs WHERE crag_id IS NULL;

-- Delete test crags (no country_code - cannot have SEO-friendly URLs)
-- These appear to be test entries with names like 'ccc', 'xxx', 'yyy', 'sss'
-- They have slugs but no country code, making them unreachable via SEO URLs
DELETE FROM public.crags WHERE country_code IS NULL;
