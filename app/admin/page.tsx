import Link from 'next/link'
import { Building2, Flag, Mountain } from 'lucide-react'

const adminSections = [
  {
    href: '/admin/flags',
    title: 'Flags',
    description: 'Review and resolve user-submitted flags for climbs and images.',
    icon: Flag,
  },
  {
    href: '/admin/crags',
    title: 'Crags',
    description: 'Manage crag records, naming, and moderation actions.',
    icon: Mountain,
  },
  {
    href: '/admin/gyms',
    title: 'Gyms',
    description: 'Create gym places, upload floor plans, and seed starter routes.',
    icon: Building2,
  },
]

export default function AdminOverviewPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-white">Admin Overview</h1>
        <p className="mt-2 text-gray-400">Choose an admin section to continue moderation work.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {adminSections.map((section) => {
          const Icon = section.icon

          return (
            <Link
              key={section.href}
              href={section.href}
              className="rounded-xl border border-gray-800 bg-gray-900 p-5 transition hover:border-gray-700 hover:bg-gray-800"
            >
              <div className="mb-3 inline-flex rounded-lg bg-gray-800 p-2 text-gray-200">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="text-lg font-semibold text-white">{section.title}</h2>
              <p className="mt-2 text-sm text-gray-400">{section.description}</p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
