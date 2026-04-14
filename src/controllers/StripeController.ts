import { Request, Response } from 'express'
import Stripe from 'stripe'
import { Project } from '../models/Project'
import { getStripe, getStripeWebhookSecret } from '../config/stripe'
import { getFrontendUrl, getFrontendUrlNoWww } from '../config/urls'
import { ApiResponse } from '../views/response'
import { sendClientDashboardEmail } from '../services/emailService'

// Frontend URL for Stripe redirects.
// Note: we trim trailing slashes so URL concatenation does not create `//`.
const FRONTEND_URL = getFrontendUrl()
const FRONTEND_URL_NO_WWW = getFrontendUrlNoWww()

async function getBillingTaxDetails(
  stripe: Stripe,
  session: Stripe.Checkout.Session
): Promise<{ stripeCustomerId?: string; billingCompanyName?: string; billingTaxIds?: string[] }> {
  const stripeCustomerId = typeof session.customer === 'string' ? session.customer : undefined
  const billingCompanyName = session.customer_details?.name || undefined
  const taxIdsFromSession = (session.customer_details?.tax_ids || [])
    .map((tax) => tax?.value)
    .filter((value): value is string => Boolean(value))

  if (taxIdsFromSession.length > 0 || !stripeCustomerId) {
    return {
      stripeCustomerId,
      billingCompanyName,
      billingTaxIds: taxIdsFromSession,
    }
  }

  try {
    const listed = await stripe.customers.listTaxIds(stripeCustomerId, { limit: 10 })
    const billingTaxIds = listed.data
      .map((tax) => tax?.value)
      .filter((value): value is string => Boolean(value))

    return {
      stripeCustomerId,
      billingCompanyName,
      billingTaxIds,
    }
  } catch (error: any) {
    console.warn('[Stripe] Failed to list customer tax IDs:', error?.message || error)
    return {
      stripeCustomerId,
      billingCompanyName,
      billingTaxIds: [],
    }
  }
}

async function assertStripeTaxIsReady(stripe: Stripe): Promise<void> {
  const taxSettings = await stripe.tax.settings.retrieve()
  if (taxSettings.status === 'active') {
    return
  }

  const pendingDetails = taxSettings.status_details?.pending
  const missingFields = pendingDetails?.missing_fields || []
  const missingFieldsHint = missingFields.length > 0
    ? ` Missing fields: ${missingFields.join(', ')}.`
    : ''

  throw new Error(
    `Stripe Tax is not fully configured for this account (status: ${taxSettings.status}).` +
    `${missingFieldsHint} Configure Stripe Tax in Dashboard (head office, tax code/behavior, and registrations where required).`
  )
}

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
      if (
        /^https?:\/\/localhost(:\d+)?$/i.test(origin) ||
        origin === FRONTEND_URL ||
        origin === FRONTEND_URL_NO_WWW
      ) {
        baseUrl = origin
      }
    }

    const stripe = getStripe()
    const unitAmountCents = Math.round(Number(amount) * 100)

    // Fail fast with actionable diagnostics instead of a generic Checkout creation error.
    await assertStripeTaxIsReady(stripe)

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
      // Stripe Tax: dynamically calculate tax based on customer's billing location.
      automatic_tax: { enabled: true },
      // Always create a Stripe Customer so downstream automation can rely on customer ID.
      customer_creation: 'always',
      // Persist collected identity/address on the Customer for tax and invoicing consistency.
      customer_update: {
        address: 'auto',
        name: 'auto',
      },
      // Pre-fill email when available; Checkout still allows user to edit if needed.
      customer_email: project.client_email || undefined,
      // Require full billing details (name, email, country, billing address).
      billing_address_collection: 'required',
      // Show "I'm purchasing as a business" and collect company tax/VAT ID.
      tax_id_collection: { enabled: true },
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

    const stripe = getStripe()
    const { stripeCustomerId, billingCompanyName, billingTaxIds } = await getBillingTaxDetails(stripe, session)

    const update: Record<string, any> = {
      payment_status: 'paid',
      stripe_payment_id: session.id,
      stripe_customer_id: stripeCustomerId,
      billing_company_name: billingCompanyName,
      billing_tax_ids: billingTaxIds || [],
      invoice_visible_to_client: true,
      currency,
      custom_quote_amount: amountInMainUnit,
    }
    console.log('[Stripe] Billing object captured:', {
      projectId,
      stripe_payment_id: session.id,
      stripe_customer_id: stripeCustomerId,
      billing_company_name: billingCompanyName,
      billing_tax_ids: billingTaxIds || [],
      customer_email: session.customer_details?.email || session.customer_email || null,
    })
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
      const emailLock = await Project.findOneAndUpdate(
        {
          _id: projectId,
          payment_confirmation_email_sent_at: { $exists: false },
        },
        {
          $set: { payment_confirmation_email_sent_at: new Date() },
        },
        { new: true }
      )

      if (!emailLock) {
        console.log('[Stripe] Confirmation email already sent earlier, skipping duplicate send for project:', projectId)
        return
      }

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
