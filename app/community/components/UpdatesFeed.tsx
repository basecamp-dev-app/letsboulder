import { CommunityUpdatePost } from '@/types/community'

interface UpdatesFeedProps {
  posts: CommunityUpdatePost[]
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown time'

  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function typeLabel(type: CommunityUpdatePost['type']): string {
  if (type === 'conditions') return 'Conditions'
  if (type === 'question') return 'Question'
  return 'Update'
}

function authorLabel(post: CommunityUpdatePost): string {
  if (post.author?.display_name) return post.author.display_name
  if (post.author?.username) return `@${post.author.username}`
  return 'Community member'
}

export default function UpdatesFeed({ posts }: UpdatesFeedProps) {
  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 p-5 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-400">
        No updates yet. Share current conditions or ask a question for this place.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {posts.map(post => (
        <article key={post.id} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
              {typeLabel(post.type)}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">{formatDateTime(post.created_at)}</span>
          </div>
          {post.title ? <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-gray-100">{post.title}</p> : null}
          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">{post.body}</p>
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">Posted by {authorLabel(post)}</p>
        </article>
      ))}
    </div>
  )
}
