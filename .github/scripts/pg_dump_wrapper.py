#!/usr/bin/env python3
"""Parse Supabase connection URL and run pg_dump"""

import os
import urllib.parse
import subprocess
import sys

def main():
    url = os.environ['SUPABASE_DB_URL'].strip()
    print(f"URL: {url[:50]}...")
    
    parsed = urllib.parse.urlparse(url)
    host = parsed.hostname
    port = parsed.port
    dbname = parsed.path.strip('/')
    user = parsed.username
    password = parsed.password
    
    print(f"Host: {host}")
    print(f"Port: {port}")
    print(f"Database: {dbname}")
    print(f"User: {user}")
    
    if not host or not port:
        print("ERROR: Failed to parse connection string")
        sys.exit(1)
    
    # Build connection string
    conn_str = f"postgresql://{user}:{password}@{host}:{port}/{dbname}"
    print(f"Connecting...")
    
    mode = sys.argv[1] if len(sys.argv) > 1 else 'schema'
    
    if mode == 'schema':
        output_file = 'db/schema/schema.sql'
        pg_args = ['pg_dump', conn_str, '--schema-only', '--no-owner']
    elif mode == 'data':
        output_file = 'db/data/production_data.sql'
        pg_args = ['pg_dump', conn_str, '--data-only', '--no-owner']
    elif mode in ('full', 'full_schema'):
        output_file = 'db/schema/production_schema.sql'
        pg_args = ['pg_dump', conn_str, '--schema-only', '--no-owner']
    else:
        print(f"Unknown mode: {mode}")
        sys.exit(1)
    
    result = subprocess.run(pg_args, capture_output=True, text=True)
    
    if result.returncode == 0:
        os.makedirs(os.path.dirname(output_file), exist_ok=True)
        with open(output_file, 'w') as f:
            f.write(result.stdout)
        print(f"Success: {len(result.stdout)} bytes -> {output_file}")
    else:
        print(f"Error: {result.stderr}")
        sys.exit(1)

if __name__ == '__main__':
    main()
