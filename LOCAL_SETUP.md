# Local Development Setup

## Set Up Admin Access

Run these SQL commands in Supabase Studio (`http://localhost:54323`) to get admin access:

```sql
-- Replace with your actual auth user ID and email
INSERT INTO profiles (id, email, is_admin, username)
VALUES ('your-auth-user-id', 'your-email@example.com', true, 'yourusername')
ON CONFLICT (id) DO UPDATE SET is_admin = true;

UPDATE auth.users 
SET raw_app_meta_data = raw_app_meta_data || '{"gsyrocks_admin": true}'
WHERE id = 'your-auth-user-id';
```

## Find Your Auth User ID

1. Go to **Authentication** → **Users** in Supabase Studio
2. Find your user
3. Copy the **ID** column

## Troubleshooting

### "Not an admin" / Redirected to Home

1. **Clear browser state:**
   - Open DevTools (F12)
   - Application → Local Storage → Clear all
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
