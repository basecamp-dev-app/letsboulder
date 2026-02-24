import { supabaseAdmin } from './supabase-admin'

const TEST_USER_PASSWORD = 'TestPassword123!'

export async function createTestUser(): Promise<{ id: string; email: string; password: string }> {
  const timestamp = Date.now()
  const email = `test+${timestamp}@example.com`

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: TEST_USER_PASSWORD,
    email_confirm: true,
  })

  if (error) {
    throw new Error(`Failed to create test user: ${error.message}`)
  }

  if (!data.user) {
    throw new Error('No user returned from createUser')
  }

  return {
    id: data.user.id,
    email,
    password: TEST_USER_PASSWORD,
  }
}

export async function deleteTestUser(userId: string): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
  
  if (error) {
    console.error(`Failed to delete test user ${userId}:`, error.message)
  }
}
