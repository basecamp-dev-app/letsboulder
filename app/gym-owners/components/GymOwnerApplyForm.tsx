'use client'

import { FormEvent, useMemo, useState } from 'react'
import { csrfFetch } from '@/hooks/useCsrf'

type Facility = 'sport' | 'boulder'
type Role = 'owner' | 'manager' | 'head_setter'

const FACILITIES: Array<{ value: Facility; label: string }> = [
  { value: 'sport', label: 'Sport' },
  { value: 'boulder', label: 'Boulder' },
]

const ROLE_OPTIONS: Array<{ value: Role; label: string }> = [
  { value: 'owner', label: 'Owner' },
  { value: 'manager', label: 'Manager' },
  { value: 'head_setter', label: 'Head setter' },
]

export default function GymOwnerApplyForm() {
  const [gymName, setGymName] = useState('')
  const [address, setAddress] = useState('')
  const [facilities, setFacilities] = useState<Facility[]>([])
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [role, setRole] = useState<Role>('owner')
  const [additionalComments, setAdditionalComments] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const canSubmit = useMemo(() => {
    return (
      !isSubmitting
      && gymName.trim().length > 0
      && address.trim().length > 0
      && facilities.length > 0
      && contactPhone.trim().length > 0
      && contactEmail.trim().length > 0
      && role.length > 0
    )
  }, [address, contactEmail, contactPhone, facilities.length, gymName, isSubmitting, role])

  function toggleFacility(value: Facility) {
    setFacilities(current => {
      if (current.includes(value)) {
        return current.filter(item => item !== value)
      }
      return [...current, value]
    })
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const trimmedEmail = contactEmail.trim()
    if (!trimmedEmail.includes('@')) {
      setError('Please provide a valid email address.')
      return
    }

    if (facilities.length === 0) {
      setError('Please select at least one facility type.')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await csrfFetch('/api/gym-owners/applications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          gym_name: gymName.trim(),
          address: address.trim(),
          facilities,
          contact_phone: contactPhone.trim(),
          contact_email: trimmedEmail,
          role,
          additional_comments: additionalComments.trim() || null,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({} as { error?: string }))
        setError(payload.error || 'Could not submit your application right now.')
        return
      }

      setIsSubmitted(true)
      setGymName('')
      setAddress('')
      setFacilities([])
      setContactPhone('')
      setContactEmail('')
      setRole('owner')
      setAdditionalComments('')
    } catch {
      setError('Could not submit your application right now.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900 md:p-8">
      {isSubmitted ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300">
          Application received. We&apos;ll contact you via WhatsApp.
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block text-sm text-gray-700 dark:text-gray-300">
          Gym name
          <input
            type="text"
            value={gymName}
            onChange={event => setGymName(event.target.value)}
            required
            maxLength={200}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
          />
        </label>

        <label className="block text-sm text-gray-700 dark:text-gray-300">
          Address
          <input
            type="text"
            value={address}
            onChange={event => setAddress(event.target.value)}
            required
            maxLength={300}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
          />
        </label>

        <fieldset>
          <legend className="text-sm text-gray-700 dark:text-gray-300">Gym facilities</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {FACILITIES.map(option => (
              <label
                key={option.value}
                className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300"
              >
                <input
                  type="checkbox"
                  checked={facilities.includes(option.value)}
                  onChange={() => toggleFacility(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm text-gray-700 dark:text-gray-300">
            Phone (WhatsApp)
            <input
              type="tel"
              value={contactPhone}
              onChange={event => setContactPhone(event.target.value)}
              required
              maxLength={40}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
            />
          </label>

          <label className="block text-sm text-gray-700 dark:text-gray-300">
            Email
            <input
              type="email"
              value={contactEmail}
              onChange={event => setContactEmail(event.target.value)}
              required
              maxLength={160}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
            />
          </label>
        </div>

        <label className="block text-sm text-gray-700 dark:text-gray-300">
          Your role
          <select
            value={role}
            onChange={event => setRole(event.target.value as Role)}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
          >
            {ROLE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm text-gray-700 dark:text-gray-300">
          Additional comments
          <textarea
            value={additionalComments}
            onChange={event => setAdditionalComments(event.target.value)}
            rows={4}
            maxLength={2000}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
          />
        </label>

        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900"
        >
          {isSubmitting ? 'Submitting...' : 'Submit application'}
        </button>
      </form>
    </section>
  )
}
