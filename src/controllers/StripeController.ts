import { Request, Response } from 'express'
import Stripe from 'stripe'
import { Project } from '../models/Project'
import { getStripe, getStripeWebhookSecret } from '../config/stripe'
import { ApiResponse } from '../views/response'
import { sendClientDashboardEmail } from '../services/emailService'

// Frontend URL for Stripe redirects (use .env for localhost testing, e.g. FRONTEND_URL=http://localhost:5173)
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://frontned-mblv.vercel.app'

/**
 * POST /api/stripe/create-checkout-session
 * Body: { projectId, amount, description?, currency?, returnOrigin? }
 * returnOrigin: optional frontend origin (e.g. http://localhost:5173) so redirect after payment goes back to that host. If omitted, uses FRONTEND_URL env.
 */
export async function createCheckoutSession(req: Request, res: Response): Promise<void> {
  try {
    const { projectId, amount, description, currency: currencyParam, returnOrigin } = req.body as {
      projectId: string
      amount: number
      description?: string
      currency?: 'usd' | 'eur'
      returnOrigin?: string
    }

    const currency = (currencyParam === 'eur' ? 'eur' : 'usd') as 'usd' | 'eur'

    if (!projectId || amount == null || amount <= 0) {
      ApiResponse.error(res, 'projectId and positive amount are required', 400)
      return
    }

    const project = await Project.findById(projectId)
    if (!project) {
      ApiResponse.notFound(res, 'Project not found')
      return
    }

    // Use frontend origin when provided (e.g. localhost) so redirect stays on same host; otherwise use env
    let baseUrl = FRONTEND_URL
    if (returnOrigin && typeof returnOrigin === 'string') {
      const origin = returnOrigin.replace(/\/$/, '')
      if (/^https?:\/\/localhost(:\d+)?$/i.test(origin) || origin === FRONTEND_URL.replace(/\/$/, '')) {
        baseUrl = origin
      }
    }

    const stripe = getStripe()
    const unitAmountCents = Math.round(Number(amount) * 100)

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: description || project.name,
              description: `Project: ${project.name}`,
            },
            unit_amount: unitAmountCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: project.client_email || undefined,
      success_url: `${baseUrl}/client/${projectId}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/client/${projectId}/payment?payment=cancelled`,
      metadata: {
        projectId: projectId,
      },
    })

    await Project.findByIdAndUpdate(projectId, {
      stripe_payment_id: session.id,
      custom_quote_amount: Number(amount),
      currency,
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

    const amountTotal = session.amount_total ?? 0
    const currency = (session.currency as 'usd' | 'eur') || 'usd'
    const amountInMainUnit = amountTotal / 100

    const update: Record<string, any> = {
      payment_status: 'paid',
      stripe_payment_id: session.id,
      invoice_visible_to_client: true,
      currency,
      custom_quote_amount: amountInMainUnit,
    }
    // If an invoice already exists (e.g. edge case), mark it as payment_completed
    const hasInvoice = !!(project.invoice_url || project.invoice_status)
    if (hasInvoice) {
      update.invoice_status = 'payment_completed'
    }

    await Project.findByIdAndUpdate(projectId, update)
    res.json({ received: true })

    // Send confirmation email to client (works in production via webhook and locally if using Stripe CLI forward)
    const clientEmail =
      (session.customer_email as string) ||
      (session.customer_details?.email as string) ||
      project.client_email
    if (clientEmail) {
      sendClientDashboardEmail(
        clientEmail,
        project.client_name || 'Client',
        projectId,
        project.name
      ).then((r) => {
        if (r.success) console.log('[Stripe] Confirmation email sent to', clientEmail)
        else console.warn('[Stripe] Confirmation email failed:', r.error)
      }).catch((err) => console.error('[Stripe] Confirmation email error:', err?.message))
    } else {
      console.warn('[Stripe] No client email for confirmation (projectId:', projectId, ')')
    }
  } catch (err: any) {
    console.error('[Stripe] Webhook handler error:', err?.message)
    res.status(500).json({ success: false, message: 'Webhook handler error' })
  }
}
