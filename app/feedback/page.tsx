import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Feedback - gsyrocks',
  description: 'Report bugs, suggest features, or contact the gsyrocks team.',
}

export default function FeedbackPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Feedback & Support</h1>
      
      <div className="max-w-md mx-auto space-y-6">
        {/* Report Issue Card */}
        <a 
          href="https://github.com/gsyrocks/gsyrocks/issues" 
          target="_blank" 
          rel="noopener noreferrer"
          className="block bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-xl">
              🐛
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Report a Bug</h2>
              <p className="text-gray-600 mt-1">
                Found something broken? Open an issue on GitHub and we&apos;ll fix it.
              </p>
              <p className="text-sm text-blue-600 mt-2">Open on GitHub →</p>
            </div>
          </div>
        </a>

        {/* Feature Request Card */}
        <a 
          href="https://github.com/gsyrocks/gsyrocks/issues" 
          target="_blank" 
          rel="noopener noreferrer"
          className="block bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-xl">
              💡
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Suggest a Feature</h2>
              <p className="text-gray-600 mt-1">
                Have an idea? Request it on GitHub and vote on other suggestions.
              </p>
              <p className="text-sm text-blue-600 mt-2">Browse requests →</p>
            </div>
          </div>
        </a>

        {/* Email Contact Card */}
        <a 
          href="mailto:hello@gsyrocks.com"
          className="block bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-xl">
              ✉️
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Contact Us</h2>
              <p className="text-gray-600 mt-1">
                Private inquiries, partnerships, or just want to say hi?
              </p>
              <p className="text-sm text-blue-600 mt-2">hello@gsyrocks.com →</p>
            </div>
          </div>
        </a>

        {/* Info */}
        <p className="text-center text-gray-500 text-sm mt-8">
          gsyrocks is open source. Contributions are welcome!
        </p>
      </div>
    </div>
  )
}
