# Local Development Setup

## Prerequisites

### 1. Install Docker

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose
sudo systemctl start docker
sudo usermod -aG docker $USER
# Log out and back in for group changes to take effect
```

### 2. Install Supabase CLI (Binary)

Lightweight installation without npm:

```bash
# Download binary
curl -L https://github.com/supabase/cli/releases/download/v2.72.7/supabase_linux_amd64.tar.gz -o supabase.tar.gz

# Extract and install
tar -xzf supabase.tar.gz
mkdir -p ~/.local/bin
mv supabase ~/.local/bin/
rm supabase.tar.gz

# Add to PATH (add to ~/.bashrc or ~/.zshrc for persistence)
export PATH="$HOME/.local/bin:$PATH"
```

### 3. Set Up Supabase Access

```bash
# Get token from https://supabase.com/dashboard/account/tokens
export SUPABASE_ACCESS_TOKEN=your-token-here

# Login and link to project
supabase login
supabase link --project-ref licfcldjccnqtounaeld
```

## Start Local Supabase

```bash
# Start containers
supabase start

# Access points:
# - Studio: http://localhost:54323
# - DB: postgresql://postgres:postgres@localhost:54322/postgres
# - API: http://localhost:54321
# - Mailpit: http://localhost:54324 (email testing)
```

Note: local Supabase configuration lives in `supabase/config.toml` and should be committed.

## Migrations Are Canonical

See `docs/db/migrations.md`.

## Sync Database from Production

### Option A: Full Reset (Recommended for fresh setup)

```bash
# Reset local database with production schema
supabase db reset --linked
```

### Option B: Pull Schema Only

```bash
# If migration history is out of sync
supabase migration repair --status reverted <version>
supabase db pull
```

## Node.js Version

This project requires **Node.js v20.20.0** (v24 causes bus errors with Next.js 16).

```bash
# Install and use v20
nvm install 20
nvm use 20

# Or pin automatically (project has .nvmrc)
nvm use
```

## Set Up Admin Access

### Step 1: Create Dev User

Run in Supabase Studio SQL Editor (http://localhost:54323):

```sql
-- Create auth user with admin metadata
INSERT INTO auth.users (id, email, encrypted_password, confirmed_at, raw_app_meta_data, created_at, updated_at)
VALUES (
  '25dfbf3e-00bd-4a46-9fb1-e9e0aa4e3044',
  'dev@letsboulder.com',
  '$2a$06$ha4tARgJzQFxh8i.x4wk1uKTm3gG0H.FS9/XcJBqJOiLSfyT.9RzC', -- 'devpassword123'
  NOW(),
  '{"gsyrocks_admin": true}',
  NOW(),
  NOW()
);

-- Create profile with admin flag
INSERT INTO public.profiles (id, email, is_admin, username)
VALUES ('25dfbf3e-00bd-4a46-9fb1-e9e0aa4e3044', 'dev@letsboulder.com', true, 'devadmin')
ON CONFLICT (id) DO UPDATE SET is_admin = true;

-- Create default auth instance
INSERT INTO auth.instances (id, uuid, raw_base_config, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', '{}', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Update user with proper instance
UPDATE auth.users
SET instance_id = '00000000-0000-0000-0000-000000000000',
    aud = 'authenticated',
    role = 'authenticated'
WHERE id = '25dfbf3e-00bd-4a46-9fb1-e9e0aa4e3044';
```

### Step 2: Sign In

1. Go to http://localhost:3000/auth
2. Enter `dev@letsboulder.com`
3. Check magic link at http://localhost:54324
4. Click the link to complete sign-in

## Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Run linter
npm run lint

# Start production server (after build)
npm run start
```

## Troubleshooting

### "Database error finding user"

**Cause**: Missing or incorrect `instance_id` in auth.users.

**Fix**:
```sql
INSERT INTO auth.instances (id, uuid, raw_base_config, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', '{}', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

UPDATE auth.users SET instance_id = '00000000-0000-0000-0000-000000000000' WHERE email = 'dev@letsboulder.com';
```

**Restart auth service**:
```bash
docker restart supabase_auth_app-v2
```

### "Bus error" or crash on `npm run dev`

**Cause**: Node.js v24 is incompatible with Next.js 16.

**Fix**:
```bash
nvm use 20.20.0
npm install  # Reinstall dependencies for v20
npm run dev
```

### "Not an admin" / Redirected to Home

1. Clear browser state:
   - Open DevTools (F12) → Application → Local Storage → Clear all
   - Close all tabs, open fresh incognito window

2. Verify database:
   ```sql
   SELECT id, email, is_admin FROM profiles WHERE email = 'dev@letsboulder.com';
   -- Should show is_admin = true
   ```

3. Request new magic link:
   - Go to `/auth?logout=true`
   - Request new magic link

### Can't connect to local Supabase

```bash
# Check containers are running
docker ps | grep supabase

# Check port bindings
ss -tlnp | grep 543

# Restart Supabase
supabase stop
supabase start
```

### View Logs

```bash
# Auth service logs (most common issues)
docker logs supabase_auth_app-v2 --tail 50

# All Supabase logs
docker logs supabase_db_app-v2 --tail 50
```

## Environment Variables

Create `.env.local` in project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
INTERNAL_MODERATION_SECRET=local_moderation_secret

NEXT_PUBLIC_DEV_PASSWORD_AUTH=true
DEV_USER_EMAIL=dev@letsboulder.com
DEV_USER_PASSWORD=devpassword123
```

Run `supabase start` to get local credentials.

`INTERNAL_MODERATION_SECRET` is optional for local dev. If it is missing, route photo uploads are auto-approved so images are immediately visible during development.
