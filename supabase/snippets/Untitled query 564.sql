-- Replace with your actual auth user ID and email
INSERT INTO profiles (id, email, is_admin, username)
VALUES ('your-auth-user-id', 'patrickhadow@gmail.com', true, 'yourusername')
ON CONFLICT (id) DO UPDATE SET is_admin = true;

UPDATE auth.users 
SET raw_app_meta_data = raw_app_meta_data || '{"gsyrocks_admin": true}'
WHERE id = 'your-auth-user-id';
```