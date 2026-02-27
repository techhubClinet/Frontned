import Stripe from 'stripe'

let stripeInstance: Stripe | null = null

const STRIPE_SECRET_KEY = 'sk_test_51Rj1dnBOoulucdCvbGDz4brJYHztkuL80jGSKcnQNT46g9P58pbxY36Lg3yWyMDb6Gwgv5Rr3NDfjvB2HyaDlJP7006wnXEtp1'
const STRIPE_WEBHOOK_SECRET = 'whsec_your_webhook_secret_here'

export const getStripe = (): Stripe => {
  if (!stripeInstance) {
    stripeInstance = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2025-12-15.clover',
    })
  }
  return stripeInstance
}

export const getStripeWebhookSecret = (): string => {
  return STRIPE_WEBHOOK_SECRET
}
