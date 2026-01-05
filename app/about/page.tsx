'use client'

export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">About Gsyrocks</h1>
      
      <div className="space-y-8 text-gray-900 dark:text-gray-300">
        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">Purpose</h2>
          <p className="leading-relaxed">
            The purpose of this site is to record the bouldering of Guernsey while making bouldering information accessible and creating the facility to record ascents and grade problems democratically.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">Privacy</h2>
          <p className="leading-relaxed">
            With regard to personal information the only data we collect from users is that required for account registration (email). Precise location data is never recorded. If you would like your data deleted, please email us at <a href="mailto:guernseyrockshelp@gmail.com" className="text-blue-600 dark:text-blue-400 hover:underline">guernseyrockshelp@gmail.com</a>.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">Contributing to the Record</h2>
          <p className="leading-relaxed mb-4">
            We need as much information about bouldering in Guernsey as possible, and if you would like to help us in this that would be great!
          </p>
          <p className="leading-relaxed mb-4">
            Users can help by providing new climb information and recommendations about corrections to existing data. If you want to provide a climb on an existing boulder, we will need a grade, a description of the line up the boulder (so the topo can be updated), a description of the line (for display on the site), and a name for the line. If you want to provide a climb(s) on a new boulder, we will need a quality image of the boulder, gps location of the boulder, and tidal information on top of the basic climb information.
          </p>
          <p className="leading-relaxed">
            If you would like to contribute to the record, please email <a href="mailto:hello@gsyrocks.com" className="text-blue-600 dark:text-blue-400 hover:underline">hello@gsyrocks.com</a>.
          </p>
        </section>
      </div>
    </div>
  )
}
