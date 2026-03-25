-- Fix grade_mappings.v_scale to use precise display values from V_SCALE_DISPLAY_BY_GRADE
-- Previously used simplified V-grades (V3, V4, etc.) which didn't match the client-side
-- display logic that uses intermediate values (V3-4, V4-5, etc.)

UPDATE grade_mappings SET v_scale = 'VB-'  WHERE grade_index IN (0, 1, 2, 3, 4);
UPDATE grade_mappings SET v_scale = 'V0-'  WHERE grade_index = 6;
UPDATE grade_mappings SET v_scale = 'V0+'  WHERE grade_index = 8;
UPDATE grade_mappings SET v_scale = 'V1-'  WHERE grade_index = 9;
UPDATE grade_mappings SET v_scale = 'V1+'  WHERE grade_index = 11;
UPDATE grade_mappings SET v_scale = 'V1-2' WHERE grade_index = 12;
UPDATE grade_mappings SET v_scale = 'V2-'  WHERE grade_index = 13;
UPDATE grade_mappings SET v_scale = 'V2+'  WHERE grade_index = 15;
UPDATE grade_mappings SET v_scale = 'V2-3' WHERE grade_index = 16;
UPDATE grade_mappings SET v_scale = 'V3-'  WHERE grade_index = 17;
UPDATE grade_mappings SET v_scale = 'V3-4' WHERE grade_index = 19;
UPDATE grade_mappings SET v_scale = 'V4-5' WHERE grade_index = 21;
UPDATE grade_mappings SET v_scale = 'V5-6' WHERE grade_index = 23;
UPDATE grade_mappings SET v_scale = 'V7-'  WHERE grade_index = 25;
UPDATE grade_mappings SET v_scale = 'V8-'  WHERE grade_index = 26;
UPDATE grade_mappings SET v_scale = 'V8+'  WHERE grade_index = 27;
UPDATE grade_mappings SET v_scale = 'V17+' WHERE grade_index = 37;
UPDATE grade_mappings SET v_scale = 'V18+' WHERE grade_index = 39;
UPDATE grade_mappings SET v_scale = 'V19+' WHERE grade_index = 41;
