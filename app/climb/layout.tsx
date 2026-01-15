import { Metadata } from 'next'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const { id } = await params
  const { data: climb } = await supabase
    .from('climbs')
    .select('name, grade')
    .eq('id', id)
    .single()

  if (!climb) {
    return {
      title: 'Climb Not Found | gsyrocks',
      description: 'This climb could not be found.',
    }
  }

  return {
    title: `${climb.name} (${climb.grade}) | gsyrocks`,
    description: `Climb ${climb.name} graded ${climb.grade} in Guernsey. View route details, log your ascent, and track your progress.`,
    openGraph: {
      title: `${climb.name} (${climb.grade}) | gsyrocks`,
      description: `Climb ${climb.name} graded ${climb.grade} in Guernsey.`,
      url: `/climb/${id}`,
    },
  }
}

export default function ClimbLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
