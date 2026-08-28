'use client'

import Link from 'next/link'
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { submitGymOwnerApplicationAction } from '@/features/gym-owners/actions'
import {
  gymOwnerApplicationSchema,
  type ApplicationFacility,
  type ApplicationRole,
} from '@/features/gym-owners/lib/application-schema'
import Turnstile from '@/components/ui/Turnstile'

type FieldName = 'gym_name' | 'address' | 'city' | 'country' | 'postcode_or_zip' | 'facilities'
  | 'contact_phone' | 'contact_email' | 'role' | 'additional_comments' | 'turnstileToken'

type FormState = {
  gym_name: string
  address: string
  city: string
  country: string
  postcode_or_zip: string
  facilities: ApplicationFacility[]
  contact_phone: string
  contact_email: string
  role: ApplicationRole
  additional_comments: string
  turnstileToken: string
}

const INITIAL_FORM: FormState = {
  gym_name: '', address: '', city: '', country: '', postcode_or_zip: '', facilities: [],
  contact_phone: '', contact_email: '', role: 'owner', additional_comments: '', turnstileToken: '',
}

const FACILITIES: Array<{ value: ApplicationFacility; label: string }> = [
  { value: 'sport', label: 'Sport' },
  { value: 'boulder', label: 'Boulder' },
]

const ROLE_OPTIONS: Array<{ value: ApplicationRole; label: string }> = [
  { value: 'owner', label: 'Owner' },
  { value: 'manager', label: 'Manager' },
  { value: 'head_setter', label: 'Head setter' },
]

const FIELD_IDS: Record<FieldName, string> = {
  gym_name: 'gym-name', address: 'gym-address', city: 'gym-city', country: 'gym-country',
  postcode_or_zip: 'gym-postcode', facilities: 'gym-facilities', contact_phone: 'contact-phone',
  contact_email: 'contact-email', role: 'applicant-role', additional_comments: 'additional-comments',
  turnstileToken: 'application-verification',
}

const FIELD_LABELS: Record<FieldName, string> = {
  gym_name: 'Gym name', address: 'Address', city: 'City', country: 'Country',
  postcode_or_zip: 'Postcode / ZIP', facilities: 'Gym facilities', contact_phone: 'Phone (WhatsApp)',
  contact_email: 'Email', role: 'Your role', additional_comments: 'Additional comments',
  turnstileToken: 'Verification',
}

function isFieldName(value: PropertyKey): value is FieldName {
  return typeof value === 'string' && value in FIELD_IDS
}

function getErrorFields(errors: Partial<Record<FieldName, string>>): FieldName[] {
  return Object.entries(errors).flatMap(([field, message]) => isFieldName(field) && message ? [field] : [])
}

function getValidationErrors(form: FormState): Partial<Record<FieldName, string>> {
  const result = gymOwnerApplicationSchema.safeParse({
    ...form,
    additional_comments: form.additional_comments || null,
    website_url: '',
  })
  if (result.success) return {}

  const errors: Partial<Record<FieldName, string>> = {}
  for (const issue of result.error.issues) {
    const field = issue.path[0]
    if (isFieldName(field) && !errors[field]) errors[field] = issue.message
  }
  return errors
}

function RequiredMark() {
  return <span className="text-red-600 dark:text-red-400" aria-hidden="true"> *</span>
}

function FieldError({ field, message }: { field: FieldName; message?: string }) {
  if (!message) return null
  return <p id={`${FIELD_IDS[field]}-error`} className="mt-1 text-sm text-red-700 dark:text-red-300" aria-live="polite">{message}</p>
}

function inputClass(hasError: boolean) {
  return `mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-gray-950 dark:text-gray-100 ${
    hasError ? 'border-red-600 dark:border-red-500' : 'border-gray-300 dark:border-gray-700'
  }`
}

export default function GymOwnerApplyForm() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [verificationKey, setVerificationKey] = useState(0)
  const [focusTarget, setFocusTarget] = useState<FieldName | 'summary' | 'server' | 'success' | null>(null)
  const fieldRefs = useRef<Partial<Record<FieldName, HTMLElement | null>>>({})
  const summaryRef = useRef<HTMLDivElement>(null)
  const serverErrorRef = useRef<HTMLDivElement>(null)
  const successRef = useRef<HTMLHeadingElement>(null)

  const errorFields = useMemo(() => getErrorFields(fieldErrors), [fieldErrors])

  useEffect(() => {
    if (!focusTarget) return
    if (focusTarget === 'summary') summaryRef.current?.focus()
    else if (focusTarget === 'server') serverErrorRef.current?.focus()
    else if (focusTarget === 'success') successRef.current?.focus()
    else fieldRefs.current[focusTarget]?.focus()
    setFocusTarget(null)
  }, [focusTarget])

  function updateTextField<K extends Exclude<FieldName, 'facilities' | 'turnstileToken'>>(field: K, value: FormState[K]) {
    setForm(current => {
      const next = { ...current, [field]: value }
      if (fieldErrors[field]) {
        const message = getValidationErrors(next)[field]
        setFieldErrors(errors => ({ ...errors, [field]: message }))
      }
      return next
    })
    setServerError(null)
  }

  function validateField(field: FieldName) {
    const message = getValidationErrors(form)[field]
    setFieldErrors(errors => ({ ...errors, [field]: message }))
  }

  function toggleFacility(value: ApplicationFacility) {
    setForm(current => {
      const facilities = current.facilities.includes(value)
        ? current.facilities.filter(item => item !== value)
        : [...current.facilities, value]
      const next = { ...current, facilities }
      if (fieldErrors.facilities) {
        setFieldErrors(errors => ({ ...errors, facilities: getValidationErrors(next).facilities }))
      }
      return next
    })
    setServerError(null)
  }

  const handleVerification = useCallback((token: string) => {
    setForm(current => ({ ...current, turnstileToken: token }))
    setFieldErrors(errors => ({ ...errors, turnstileToken: undefined }))
    setServerError(null)
  }, [])

  const handleVerificationFailure = useCallback(() => {
    setForm(current => ({ ...current, turnstileToken: '' }))
    setFieldErrors(errors => ({ ...errors, turnstileToken: 'Complete the verification again.' }))
  }, [])

  function focusErrors(errors: Partial<Record<FieldName, string>>) {
    const fields = getErrorFields(errors)
    setFocusTarget(fields.length > 1 ? 'summary' : fields[0] ?? null)
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setServerError(null)

    const validationErrors = getValidationErrors(form)
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors)
      focusErrors(validationErrors)
      return
    }

    setIsSubmitting(true)
    try {
      const result = await submitGymOwnerApplicationAction({
        ...form,
        additional_comments: form.additional_comments.trim() || null,
        website_url: '',
      })

      if (!result.success) {
        const errors: Partial<Record<FieldName, string>> = {}
        for (const [field, messages] of Object.entries(result.fieldErrors ?? {})) {
          if (isFieldName(field) && messages?.[0]) errors[field] = messages[0]
        }

        if (result.status === 403) {
          errors.turnstileToken = 'Verification expired or failed. Complete it again.'
          setForm(current => ({ ...current, turnstileToken: '' }))
          setVerificationKey(current => current + 1)
        }

        if (Object.keys(errors).length > 0) {
          setFieldErrors(errors)
          focusErrors(errors)
        } else {
          const message = result.status === 429
            ? 'Too many attempts were made. Wait a few minutes, then try again.'
            : result.status === 409
              ? result.error || 'An application for this gym has already been received.'
              : 'We could not submit your application. Your details are still here—please try again.'
          setServerError(message)
          setFocusTarget('server')
        }
        return
      }

      setFieldErrors({})
      setIsSubmitted(true)
      setFocusTarget('success')
    } catch {
      setServerError('Your connection was interrupted. Your details are still here—check your connection and try again.')
      setFocusTarget('server')
    } finally {
      setIsSubmitting(false)
    }
  }

  function startAnotherApplication() {
    setForm(INITIAL_FORM)
    setFieldErrors({})
    setServerError(null)
    setIsSubmitted(false)
    setVerificationKey(current => current + 1)
  }

  if (isSubmitted) {
    return (
      <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900 md:p-8">
        <div className="space-y-4" role="status" aria-live="polite">
          <h2 ref={successRef} tabIndex={-1} className="text-xl font-semibold text-gray-900 focus:outline-none dark:text-gray-100">
            Application received
          </h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            We&apos;ll review your application and contact you via WhatsApp with the next steps. You do not need to submit it again.
          </p>
          <button type="button" onClick={startAnotherApplication} className="inline-flex min-h-11 items-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
            Submit another application
          </button>
        </div>
      </section>
    )
  }

  const describedBy = (field: FieldName) => fieldErrors[field] ? `${FIELD_IDS[field]}-error` : undefined
  const setFieldRef = (field: FieldName) => (node: HTMLElement | null) => { fieldRefs.current[field] = node }

  return (
    <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900 md:p-8">
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
          <p>Fields marked <span className="text-red-600 dark:text-red-400" aria-hidden="true">*</span><span className="sr-only">with an asterisk</span> are required. Additional comments are optional.</p>
          <p>You can submit at any time. We&apos;ll highlight anything that needs attention.</p>
        </div>

        {errorFields.length > 1 ? (
          <div ref={summaryRef} tabIndex={-1} role="alert" aria-labelledby="application-errors-title" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
            <h2 id="application-errors-title" className="font-semibold">Check {errorFields.length} fields</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {errorFields.map(field => (
                <li key={field}>
                  <button type="button" className="text-left underline underline-offset-2" onClick={() => fieldRefs.current[field]?.focus()}>
                    {FIELD_LABELS[field]}: {fieldErrors[field]}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <label className="block text-sm text-gray-700 dark:text-gray-300" htmlFor={FIELD_IDS.gym_name}>Gym name<RequiredMark /></label>
          <input ref={setFieldRef('gym_name')} id={FIELD_IDS.gym_name} name="gym_name" type="text" value={form.gym_name} onChange={event => updateTextField('gym_name', event.target.value)} onBlur={() => validateField('gym_name')} required maxLength={200} autoComplete="organization" aria-invalid={Boolean(fieldErrors.gym_name)} aria-describedby={describedBy('gym_name')} className={inputClass(Boolean(fieldErrors.gym_name))} />
          <FieldError field="gym_name" message={fieldErrors.gym_name} />
        </div>

        <div>
          <label className="block text-sm text-gray-700 dark:text-gray-300" htmlFor={FIELD_IDS.address}>Address<RequiredMark /></label>
          <input ref={setFieldRef('address')} id={FIELD_IDS.address} name="address" type="text" value={form.address} onChange={event => updateTextField('address', event.target.value)} onBlur={() => validateField('address')} required maxLength={300} autoComplete="street-address" aria-invalid={Boolean(fieldErrors.address)} aria-describedby={describedBy('address')} className={inputClass(Boolean(fieldErrors.address))} />
          <FieldError field="address" message={fieldErrors.address} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-sm text-gray-700 dark:text-gray-300" htmlFor={FIELD_IDS.city}>City<RequiredMark /></label>
            <input ref={setFieldRef('city')} id={FIELD_IDS.city} name="city" type="text" value={form.city} onChange={event => updateTextField('city', event.target.value)} onBlur={() => validateField('city')} required maxLength={120} autoComplete="address-level2" aria-invalid={Boolean(fieldErrors.city)} aria-describedby={describedBy('city')} className={inputClass(Boolean(fieldErrors.city))} />
            <FieldError field="city" message={fieldErrors.city} />
          </div>
          <div>
            <label className="block text-sm text-gray-700 dark:text-gray-300" htmlFor={FIELD_IDS.country}>Country<RequiredMark /></label>
            <input ref={setFieldRef('country')} id={FIELD_IDS.country} name="country" type="text" value={form.country} onChange={event => updateTextField('country', event.target.value)} onBlur={() => validateField('country')} required maxLength={120} autoComplete="country-name" aria-invalid={Boolean(fieldErrors.country)} aria-describedby={describedBy('country')} className={inputClass(Boolean(fieldErrors.country))} />
            <FieldError field="country" message={fieldErrors.country} />
          </div>
          <div>
            <label className="block text-sm text-gray-700 dark:text-gray-300" htmlFor={FIELD_IDS.postcode_or_zip}>Postcode / ZIP<RequiredMark /></label>
            <input ref={setFieldRef('postcode_or_zip')} id={FIELD_IDS.postcode_or_zip} name="postcode_or_zip" type="text" value={form.postcode_or_zip} onChange={event => updateTextField('postcode_or_zip', event.target.value)} onBlur={() => validateField('postcode_or_zip')} required maxLength={32} autoComplete="postal-code" aria-invalid={Boolean(fieldErrors.postcode_or_zip)} aria-describedby={describedBy('postcode_or_zip')} className={inputClass(Boolean(fieldErrors.postcode_or_zip))} />
            <FieldError field="postcode_or_zip" message={fieldErrors.postcode_or_zip} />
          </div>
        </div>

        <fieldset ref={setFieldRef('facilities')} id={FIELD_IDS.facilities} tabIndex={-1} aria-invalid={Boolean(fieldErrors.facilities)} aria-describedby={describedBy('facilities')} className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <legend className="text-sm text-gray-700 dark:text-gray-300">Gym facilities<RequiredMark /></legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {FACILITIES.map(option => (
              <label key={option.value} className="flex min-h-11 items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:text-gray-300">
                <input type="checkbox" name="facilities" value={option.value} checked={form.facilities.includes(option.value)} onChange={() => toggleFacility(option.value)} onBlur={() => validateField('facilities')} />
                {option.label}
              </label>
            ))}
          </div>
          <FieldError field="facilities" message={fieldErrors.facilities} />
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm text-gray-700 dark:text-gray-300" htmlFor={FIELD_IDS.contact_phone}>Phone (WhatsApp)<RequiredMark /></label>
            <input ref={setFieldRef('contact_phone')} id={FIELD_IDS.contact_phone} name="contact_phone" type="tel" value={form.contact_phone} onChange={event => updateTextField('contact_phone', event.target.value)} onBlur={() => validateField('contact_phone')} required maxLength={40} autoComplete="tel" aria-invalid={Boolean(fieldErrors.contact_phone)} aria-describedby={describedBy('contact_phone')} className={inputClass(Boolean(fieldErrors.contact_phone))} />
            <FieldError field="contact_phone" message={fieldErrors.contact_phone} />
          </div>
          <div>
            <label className="block text-sm text-gray-700 dark:text-gray-300" htmlFor={FIELD_IDS.contact_email}>Email<RequiredMark /></label>
            <input ref={setFieldRef('contact_email')} id={FIELD_IDS.contact_email} name="contact_email" type="email" value={form.contact_email} onChange={event => updateTextField('contact_email', event.target.value)} onBlur={() => validateField('contact_email')} required maxLength={160} autoComplete="email" aria-invalid={Boolean(fieldErrors.contact_email)} aria-describedby={describedBy('contact_email')} className={inputClass(Boolean(fieldErrors.contact_email))} />
            <FieldError field="contact_email" message={fieldErrors.contact_email} />
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-700 dark:text-gray-300" htmlFor={FIELD_IDS.role}>Your role<RequiredMark /></label>
          <select ref={setFieldRef('role')} id={FIELD_IDS.role} name="role" value={form.role} onChange={event => updateTextField('role', event.target.value as ApplicationRole)} onBlur={() => validateField('role')} required aria-invalid={Boolean(fieldErrors.role)} aria-describedby={describedBy('role')} className={inputClass(Boolean(fieldErrors.role))}>
            {ROLE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <FieldError field="role" message={fieldErrors.role} />
        </div>

        <div>
          <label className="block text-sm text-gray-700 dark:text-gray-300" htmlFor={FIELD_IDS.additional_comments}>Additional comments <span className="text-gray-500 dark:text-gray-400">(optional)</span></label>
          <textarea ref={setFieldRef('additional_comments')} id={FIELD_IDS.additional_comments} name="additional_comments" value={form.additional_comments} onChange={event => updateTextField('additional_comments', event.target.value)} onBlur={() => validateField('additional_comments')} rows={4} maxLength={2000} aria-invalid={Boolean(fieldErrors.additional_comments)} aria-describedby={describedBy('additional_comments')} className={inputClass(Boolean(fieldErrors.additional_comments))} />
          <FieldError field="additional_comments" message={fieldErrors.additional_comments} />
        </div>

        <div ref={setFieldRef('turnstileToken')} id={FIELD_IDS.turnstileToken} tabIndex={-1} role="group" aria-label="Application verification, required" aria-describedby={describedBy('turnstileToken')} className="focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Turnstile key={verificationKey} onVerify={handleVerification} onError={handleVerificationFailure} onExpired={handleVerificationFailure} />
          <FieldError field="turnstileToken" message={fieldErrors.turnstileToken} />
        </div>

        <div className="rounded-md bg-gray-50 p-4 text-sm text-gray-700 dark:bg-gray-950 dark:text-gray-300">
          We&apos;ll use your phone number to contact you on WhatsApp about this application. See our <Link href="/privacy" className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-gray-100">privacy policy</Link> for how we handle your details.
        </div>

        {serverError ? (
          <div ref={serverErrorRef} tabIndex={-1} role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
            <p>{serverError}</p>
            <button type="submit" className="mt-2 min-h-11 font-semibold underline underline-offset-2">Try submitting again</button>
          </div>
        ) : null}

        <button type="submit" disabled={isSubmitting} aria-describedby="submit-readiness" className="inline-flex min-h-11 items-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200">
          {isSubmitting ? 'Submitting application…' : 'Submit application'}
        </button>
        <p id="submit-readiness" className="text-sm text-gray-600 dark:text-gray-400" aria-live="polite">
          {isSubmitting ? 'Please wait while your application is sent.' : 'Submit to check the form and send your application.'}
        </p>
      </form>
    </section>
  )
}
