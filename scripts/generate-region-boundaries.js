#!/usr/bin/env node

/**
 * Node.js script to parse Natural Earth 110m Admin 0 Countries GeoJSON
 * and generate SQL UPDATE statements for the regions table.
 * 
 * Usage:
 *   node scripts/generate-region-boundaries.js > supabase/migrations/20260315000001_populate_region_boundaries_auto.sql
 * 
 * Requirements:
 *   - Download ne_110m_admin_0_countries.geojson from:
 *     https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_admin_0_countries.geojson
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration - Use the user's provided file
const GEOJSON_PATH = '/home/hadow/Downloads/ne_110m_admin_0_countries.geojson.geojson';
const OUTPUT_PATH = path.join(__dirname, '../supabase/migrations/20260315000001_populate_region_boundaries_auto.sql');

// Mapping is not needed since Natural Earth uses iso_a2 directly

// Read and parse GeoJSON
if (!fs.existsSync(GEOJSON_PATH)) {
  console.error(`Error: GeoJSON file not found at ${GEOJSON_PATH}`);
  console.error('Please download it from:');
  console.error('https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_admin_0_countries.geojson');
  process.exit(1);
}

const geojsonData = JSON.parse(fs.readFileSync(GEOJSON_PATH, 'utf8'));

// Generate SQL statements
let sql = `-- Auto-generated SQL from Natural Earth 110m Admin 0 Countries GeoJSON\n`;
sql += `-- Generated: ${new Date().toISOString()}\n`;
sql += `-- Source: https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_admin_0_countries.geojson\n\n`;

let count = 0;
for (const feature of geojsonData.features) {
  // Use iso_a2 which is the 2-letter country code in Natural Earth data
  const iso2 = feature.properties.iso_a2;
  const name = feature.properties.name || feature.properties.admin;
  
  if (!iso2 || iso2 === '-99') {
    console.warn(`Warning: Invalid ISO 2-letter code for ${name}`);
    continue;
  }
  
  const geometry = JSON.stringify(feature.geometry);
  
  sql += `-- ${name} (${iso2})\n`;
  sql += `UPDATE public.regions\n`;
  sql += `SET boundary = ST_GeomFromGeoJSON('${geometry.replace(/'/g, "''")}')\n`;
  sql += `WHERE country_code = '${iso2}';\n\n`;
  
  count++;
}

sql += `-- Updated ${count} regions\n`;

// Write output
fs.writeFileSync(OUTPUT_PATH, sql);
console.log(`Generated SQL for ${count} regions at ${OUTPUT_PATH}`);