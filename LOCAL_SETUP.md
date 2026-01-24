# Local Development Setup

This guide explains how to set up local development environment with admin access.

## Prerequisites

- Supabase CLI installed
- Local Supabase running (`supabase start` or Docker)

## Initial Setup

### 1. Start Local Supabase

```bash
supabase start
# or if using Docker directly
docker compose up -d
```

### 2. Run Migrations

Apply the production-safe migration:

```bash
supabase db push
```

### 3. Set Up Admin Access

Run these SQL commands in Supabase Studio (`http://localhost:54323`) or via psql:

```bash
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres
```

Then run:

```sql
-- Replace with your actual auth user ID and email
-- Find your auth user ID from Authentication → Users in Supabase Studio

INSERT INTO profiles (id, email, is_admin, username)
VALUES ('your-auth-user-id', 'your-email@example.com', true, 'yourusername')
ON CONFLICT (id) DO UPDATE SET is_admin = true;

-- Add admin to auth metadata as fallback
UPDATE auth.users 
SET raw_app_meta_data = raw_app_meta_data || '{"gsyrocks_admin": true}'
WHERE id = 'your-auth-user-id';
```

### 4. Find Your Auth User ID

In Supabase Studio:
1. Go to **Authentication** → **Users**
2. Find your user
3. Copy the **ID** column

### 5. Start Development Server

```bash
npm run dev
```

Visit `http://localhost:3000/admin/flags` - you should now have admin access.

## Troubleshooting

### "Not an admin" / Redirected to Home

1. **Clear browser state:**
   - Open DevTools (F12)
   - Application → Local Storage → Clear all
   - Cookies → Clear all
   - Close all tabs, open fresh incognito window

2. **Verify database:**
   ```sql
   SELECT id, email, is_admin FROM profiles WHERE email = 'your-email@example.com';
   -- Should show is_admin = true
   ```

3. **Request new magic link:**
   - Go to `/auth?logout=true`
   - Request new magic link
   - Click link and log in fresh

### Duplicate Profiles

If you see multiple profiles for your email:

```sql
-- Clean up duplicates, keep one with admin
DELETE FROM profiles WHERE email = 'your-email@example.com';

-- Recreate profile
INSERT INTO profiles (id, email, is_admin, username)
VALUES ('your-auth-user-id', 'your-email@example.com', true, 'yourusername');
```

## Important Notes

- **DO NOT** push `20260208000001_local_dev_setup.sql` to production
- The local-only migration sets ALL users to admin - security risk!
- When pushing to production, delete that file first:
  ```bash
  rm supabase/migrations/20260208000001_local_dev_setup.sql
  ```

## Supabase Studio URL

Access local Supabase dashboard at: `http://localhost:54323`
