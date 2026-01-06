import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { headers } from 'next/headers'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-12-15.clover',
})

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  const body = await request.text()
  const signature = (await headers()).get('stripe-signature') || ''

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Webhook error' }, { status: 400 })
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.user_id
      const customerId = session.customer as string

      if (userId) {
        const { error } = await supabaseAdmin
          .from('profiles')
          .update({
            stripe_customer_id: customerId,
            is_pro: true,
            subscription_status: 'active',
            updated_at: new Date().toISOString()
          })
          .eq('id', userId)

        if (error) {
          console.error('Failed to update profile:', error)
          return NextResponse.json({ error: 'Database error' }, { status: 500 })
        }

        console.log(`User ${userId} upgraded to pro`)
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = subscription.customer as string

      const { error } = await supabaseAdmin
        .from('profiles')
        .update({
          is_pro: false,
          subscription_status: 'canceled',
          updated_at: new Date().toISOString()
        })
        .eq('stripe_customer_id', customerId)

      if (error) {
        console.error('Failed to update profile on subscription cancel:', error)
        return NextResponse.json({ error: 'Database error' }, { status: 500 })
      }

      console.log(`Customer ${customerId} subscription canceled`)
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('Webhook handler error:', err)
    return NextResponse.json({ error: 'Handler error' }, { status: 500 })
  }
}
