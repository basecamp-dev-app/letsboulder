import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function DELETE(request: NextRequest) {
  const cookies = request.cookies
  const { searchParams } = new URL(request.url)
  const deleteRouteUploads = searchParams.get('delete_route_uploads') === 'true'

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookies.getAll() },
        setAll() {},
      },
    }
  )

  try {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (deleteRouteUploads) {
      const { data: files } = await supabase.storage
        .from('route-uploads')
        .list(user.id, { limit: 1000 })

      if (files && files.length > 0) {
        const paths = files.map(f => `${user.id}/${f.name}`)
        await supabase.storage.from('route-uploads').remove(paths)
      }
    }

    const { data: avatarFiles } = await supabase.storage
      .from('avatars')
      .list(user.id, { limit: 10 })

    if (avatarFiles && avatarFiles.length > 0) {
      const paths = avatarFiles.map(f => `${user.id}/${f.name}`)
      await supabase.storage.from('avatars').remove(paths)
    }

    await supabase.from('admin_actions').delete().eq('user_id', user.id)
    await supabase.from('user_climbs').delete().eq('user_id', user.id)
    await supabase.from('climb_corrections').delete().eq('user_id', user.id)
    await supabase.from('correction_votes').delete().eq('user_id', user.id)
    await supabase.from('logs').delete().eq('user_id', user.id)
    await supabase.from('climb_verifications').delete().eq('user_id', user.id)
    await supabase.from('grade_votes').delete().eq('user_id', user.id)
    await supabase.from('route_grades').delete().eq('user_id', user.id)

    if (deleteRouteUploads) {
      await supabase.from('images').delete().eq('created_by', user.id)
      await supabase.from('climbs').delete().eq('user_id', user.id)
    } else {
      await supabase.from('images').update({ created_by: null }).eq('created_by', user.id)
      await supabase.from('climbs').update({ user_id: null }).eq('user_id', user.id)
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', user.id)

    if (profileError) {
      console.error('Error deleting profile:', profileError)
      return NextResponse.json({ error: 'Failed to delete profile' }, { status: 500 })
    }

    await supabase.auth.signOut()

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Account deletion error:', error)
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
  }
}
