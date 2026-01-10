#!/usr/bin/env python3
"""
Supabase REST API Export Script
Exports database data to SQL files using Supabase REST API.
Usage:
    python3 scripts/supabase_api_export.py schema    # Generate schema from migrations
    python3 scripts/supabase_api_export.py data      # Export data only
    python3 scripts/supabase_api_export.py full      # Schema + data
"""

import os
import sys
import json
import time
import urllib.request
import urllib.error
from pathlib import Path

SUPABASE_PROJECT = os.environ.get('SUPABASE_PROJECT')
SUPABASE_SERVICE_ROLE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

ALL_TABLES = ['regions', 'crags', 'climbs', 'user_climbs', 'admin_actions']
BASE_URL = f'https://{SUPABASE_PROJECT}.supabase.co/rest/v1'
HEADERS = {
    'Authorization': f'Bearer {SUPABASE_SERVICE_ROLE_KEY}',
    'apikey': SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'count=exact'
}
OUTPUT_DIR_SCHEMA = Path('db/schema')
OUTPUT_DIR_DATA = Path('db/data')


def make_request(url, retries=3, delay=1):
    """Make HTTP request with retry logic."""
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as response:
                data = response.read().decode('utf-8')
                count = response.headers.get('Content-Range', '').split('/')[-1] if 'Content-Range' in response.headers else None
                return json.loads(data), count
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < retries - 1:
                time.sleep(delay * (attempt + 1))
                continue
            if e.code == 404:
                return None, None
            error_body = e.read().decode('utf-8') if e.fp else ''
            print(f'HTTP Error {e.code}: {error_body}')
            sys.exit(1)
        except Exception as e:
            print(f'Error: {e}')
            sys.exit(1)
    return None, None


def table_exists(table_name):
    """Check if a table exists in the database."""
    url = f'{BASE_URL}/{table_name}?select=id&limit=1'
    data, _ = make_request(url)
    return data is not None


def export_table_data(table_name, output_file):
    """Export table data to INSERT statements."""
    all_rows = []
    offset = 0
    limit = 1000

    while True:
        url = f'{BASE_URL}/{table_name}?select=*&offset={offset}&limit={limit}'
        rows, count = make_request(url)

        if not rows:
            break

        all_rows.extend(rows)
        print(f'  Fetched {len(all_rows)}/{count or "?"} rows')
        offset += limit

        if count and len(all_rows) >= int(count):
            break

    if not all_rows:
        print(f'  No data in {table_name}')
        return

    columns = list(all_rows[0].keys()) if all_rows else []

    with open(output_file, 'a') as f:
        f.write(f'-- Data for {table_name}\n')
        for row in all_rows:
            values = []
            for col in columns:
                val = row.get(col)
                if val is None:
                    values.append('NULL')
                elif isinstance(val, bool):
                    values.append('true' if val else 'false')
                elif isinstance(val, (int, float)):
                    values.append(str(val))
                elif isinstance(val, str):
                    escaped = val.replace("'", "''").replace('\\', '\\\\')
                    values.append(f"'{escaped}'")
                elif isinstance(val, dict):
                    values.append(f"'{json.dumps(val)}'")
                elif isinstance(val, list):
                    values.append(f"'{json.dumps(val)}'")
                else:
                    escaped = str(val).replace("'", "''")
                    values.append(f"'{escaped}'")

            f.write(f"INSERT INTO {table_name} ({', '.join(columns)}) VALUES ({', '.join(values)});\n")


def export_data():
    """Export all table data."""
    print('\n📦 Exporting data...')

    OUTPUT_DIR_DATA.mkdir(parents=True, exist_ok=True)
    output_file = OUTPUT_DIR_DATA / 'production_data.sql'

    with open(output_file, 'w') as f:
        f.write('-- Database Data Export\n')
        f.write(f'-- Generated: {time.strftime("%Y-%m-%d %H:%M:%S")}\n')
        f.write(f'-- Project: {SUPABASE_PROJECT}\n')
        f.write('--\n')
        f.write('-- NOTE: This file requires schema to be applied first\n')
        f.write('-- Run migrations from db/migrations/ first\n\n')

    existing_tables = []
    for table_name in ALL_TABLES:
        print(f'  Checking {table_name}...')
        if table_exists(table_name):
            existing_tables.append(table_name)
            export_table_data(table_name, output_file)
        else:
            print(f'    Table does not exist, skipping')

    print(f'\n✅ Data exported to {output_file}')
    print(f'   Tables exported: {len(existing_tables)}/{len(ALL_TABLES)}')


def copy_schema_from_migrations():
    """Copy schema from migration files."""
    print('\n📊 Exporting schema from migrations...')

    OUTPUT_DIR_SCHEMA.mkdir(parents=True, exist_ok=True)
    output_file = OUTPUT_DIR_SCHEMA / 'schema.sql'

    migration_files = sorted(Path('db/migrations').glob('*.sql'))

    with open(output_file, 'w') as out:
        out.write('-- Database Schema Export\n')
        out.write(f'-- Generated: {time.strftime("%Y-%m-%d %H:%M:%S")}\n')
        out.write(f'-- Project: {SUPABASE_PROJECT}\n')
        out.write('-- Generated from migration files\n')
        out.write('--\n\n')

        for mf in migration_files:
            print(f'  Including {mf.name}')
            with open(mf) as f:
                content = f.read()
                out.write(f'-- ========================================\n')
                out.write(f'-- From: {mf.name}\n')
                out.write(f'-- ========================================\n\n')
                out.write(content)
                out.write('\n\n')

    print(f'\n✅ Schema exported to {output_file}')


def export_full():
    """Export both schema and data."""
    copy_schema_from_migrations()
    export_data()


def main():
    if not SUPABASE_PROJECT:
        print('❌ Error: SUPABASE_PROJECT must be set')
        print('  export SUPABASE_PROJECT=glxnbxbkedeogtcivpsx')
        sys.exit(1)

    mode = sys.argv[1] if len(sys.argv) > 1 else 'schema'

    print(f'🔄 Supabase API Export')
    print(f'   Project: {SUPABASE_PROJECT}')
    print(f'   Mode: {mode}')
    print()

    OUTPUT_DIR_SCHEMA.mkdir(parents=True, exist_ok=True)

    if mode == 'schema':
        copy_schema_from_migrations()
    elif mode == 'data':
        if not SUPABASE_SERVICE_ROLE_KEY:
            print('❌ Error: SUPABASE_SERVICE_ROLE_KEY must be set for data export')
            print('  export SUPABASE_SERVICE_ROLE_KEY=your_service_role_key')
            sys.exit(1)
        export_data()
    elif mode == 'full':
        export_full()
    else:
        print(f'Unknown mode: {mode}')
        print('Usage: python3 scripts/supabase_api_export.py [schema|data|full]')
        sys.exit(1)


if __name__ == '__main__':
    main()
