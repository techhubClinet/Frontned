import { Request, Response } from 'express'
import Stripe from 'stripe'
import { Project } from '../models/Project'
import { getStripe, getStripeWebhookSecret } from '../config/stripe'
import { ApiResponse } from '../views/response'

// Deployed frontend URL – Stripe redirects here after payment success/cancel
const FRONTEND_URL = 'https://frontned-mblv.vercel.app'

/**
 * POST /api/stripe/create-checkout-session
 * Body: { projectId: string, amount: number (in dollars), description?: string }
 * Creates a Stripe Checkout Session and stores session.id on the Project.
 */
export async function createCheckoutSession(req: Request, res: Response): Promise<void> {
  try {
    const { projectId, amount, description } = req.body as {
      projectId: string
      amount: number
      description?: string
    }

    if (!projectId || amount == null || amount <= 0) {
      ApiResponse.error(res, 'projectId and positive amount are required', 400)
      return
    }

    const project = await Project.findById(projectId)
    if (!project) {
      ApiResponse.notFound(res, 'Project not found')
      return
    }

    const stripe = getStripe()
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: description || project.name,
              description: `Project: ${project.name}`,
            },
            unit_amount: Math.round(Number(amount) * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: project.client_email || undefined,
      success_url: `${FRONTEND_URL}/client/${projectId}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/client/${projectId}/payment?payment=cancelled`,
      metadata: {
        projectId: projectId,
      },
    })

    await Project.findByIdAndUpdate(projectId, {
      stripe_payment_id: session.id,
      custom_quote_amount: Number(amount),
    })

    ApiResponse.success(
      res,
      { sessionId: session.id, url: session.url },
      'Checkout session created'
    )
  } catch (err: any) {
    console.error('[Stripe] createCheckoutSession error:', err?.message)
    ApiResponse.error(res, err?.message || 'Failed to create checkout session', 500)
  }
}

/**
 * POST /api/stripe/webhook
 * Must be mounted with express.raw({ type: 'application/json' }) so req.body is the raw Buffer.
 * Verifies Stripe signature and handles checkout.session.completed.
 */
export async function handleWebhook(req: Request, res: Response): Promise<void> {
  const sig = req.headers['stripe-signature'] as string
  if (!sig) {
    res.status(400).json({ success: false, message: 'Missing stripe-signature header' })
    return
  }

  let webhookSecret: string
  try {
    webhookSecret = getStripeWebhookSecret()
  } catch (e) {
    console.error('[Stripe] Webhook secret not configured')
    res.status(500).json({ success: false, message: 'Webhook secret not configured' })
    return
  }

  // req.body must be raw (Buffer) when using express.raw()
  const rawBody = req.body as Buffer | undefined
  if (!rawBody || !Buffer.isBuffer(rawBody)) {
    res.status(400).json({ success: false, message: 'Raw body required for webhook' })
    return
  }

  let event: Stripe.Event
  try {
    const stripe = getStripe()
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
  } catch (err: any) {
    console.error('[Stripe] Webhook signature verification failed:', err?.message)
    res.status(400).json({ success: false, message: `Webhook signature verification failed: ${err?.message}` })
    return
  }

  if (event.type !== 'checkout.session.completed') {
    res.json({ received: true })
    return
  }

  const session = event.data.object as Stripe.Checkout.Session
  const projectId = session.metadata?.projectId
  if (!projectId) {
    console.error('[Stripe] checkout.session.completed missing metadata.projectId')
    res.json({ received: true })
    return
  }

  try {
    const project = await Project.findById(projectId)
    if (!project) {
      console.error('[Stripe] Project not found for id:', projectId)
      res.json({ received: true })
      return
    }

    // Client pays first; project then goes to admin → collaborator assigned → invoice uploaded later.
    // Set invoice_visible_to_client now so when an invoice is added later, the client can see it.
    const update: Record<string, any> = {
      payment_status: 'paid',
      stripe_payment_id: session.id,
      invoice_visible_to_client: true,
    }
    // If an invoice already exists (e.g. edge case), mark it as payment_completed
    const hasInvoice = !!(project.invoice_url || project.invoice_status)
    if (hasInvoice) {
      update.invoice_status = 'payment_completed'
    }

    await Project.findByIdAndUpdate(projectId, update)
    res.json({ received: true })
  } catch (err: any) {
    console.error('[Stripe] Webhook handler error:', err?.message)
    res.status(500).json({ success: false, message: 'Webhook handler error' })
  }
}
