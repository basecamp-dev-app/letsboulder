import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface DeletionRequest {
  id: string
  user_id: string
  delete_route_uploads: boolean
}

serve(async (req: Request) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: expiredRequests, error: fetchError } = await supabase
      .from('deletion_requests')
      .select('id, user_id, delete_route_uploads')
      .is('deleted_at', null)
      .is('cancelled_at', null)
      .lte('scheduled_at', new Date().toISOString())
      .limit(100)

    if (fetchError) {
      console.error('Error fetching expired requests:', fetchError)
      return new Response(JSON.stringify({ error: fetchError.message }), { status: 500 })
    }

    if (!expiredRequests || expiredRequests.length === 0) {
      return new Response(JSON.stringify({ message: 'No expired deletion requests found', processed: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.log(`Processing ${expiredRequests.length} expired deletion requests`)

    for (const request of expiredRequests) {
      await processDeletion(supabase, request)
    }

    return new Response(JSON.stringify({ message: 'Processed deletion requests', processed: expiredRequests.length }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error in delete-expired-accounts function:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
  }
})

async function processDeletion(supabase: any, request: DeletionRequest) {
  const { user_id, delete_route_uploads } = request

  try {
    if (delete_route_uploads) {
      const { data: files } = await supabase.storage
        .from('route-uploads')
        .list(user_id, { limit: 1000 })

      if (files && files.length > 0) {
        const paths = files.map((f: any) => `${user_id}/${f.name}`)
        await supabase.storage.from('route-uploads').remove(paths)
      }
    }

    const { data: avatarFiles } = await supabase.storage
      .from('avatars')
      .list(user_id, { limit: 10 })

    if (avatarFiles && avatarFiles.length > 0) {
      const paths = avatarFiles.map((f: any) => `${user_id}/${f.name}`)
      await supabase.storage.from('avatars').remove(paths)
    }

    await supabase.from('admin_actions').delete().eq('user_id', user_id)
    await supabase.from('user_climbs').delete().eq('user_id', user_id)
    await supabase.from('climb_corrections').delete().eq('user_id', user_id)
    await supabase.from('correction_votes').delete().eq('user_id', user_id)
    await supabase.from('climb_verifications').delete().eq('user_id', user_id)
    await supabase.from('grade_votes').delete().eq('user_id', user_id)
    await supabase.from('route_grades').delete().eq('user_id', user_id)

    if (delete_route_uploads) {
      await supabase.from('images').delete().eq('created_by', user_id)
      await supabase.from('climbs').delete().eq('user_id', user_id)
    } else {
      await supabase.from('images').update({ created_by: null }).eq('created_by', user_id)
      await supabase.from('climbs').update({ user_id: null }).eq('user_id', user_id)
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', user_id)

    if (profileError) {
      console.error('Error deleting profile:', profileError)
    }

    await supabase.auth.admin.deleteUser(user_id)

    await supabase
      .from('deletion_requests')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', request.id)

    console.log(`Successfully deleted user ${user_id}`)
  } catch (error) {
    console.error(`Error deleting user ${user_id}:`, error)
  }
}
