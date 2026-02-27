import express from 'express'
import cors from 'cors'
import { connectDatabase } from './config/database'
import { errorHandler } from './middleware/errorHandler'
import { sendClientDashboardEmail } from './services/emailService'

// Routes
import authRoutes from './routes/authRoutes'
import projectRoutes from './routes/projectRoutes'
import serviceRoutes from './routes/serviceRoutes'
import paymentRoutes from './routes/paymentRoutes'
import briefingRoutes from './routes/briefingRoutes'
import uploadRoutes from './routes/uploadRoutes'
import customQuoteRoutes from './routes/customQuoteRoutes'
import collaboratorRoutes from './routes/collaboratorRoutes'
import notificationRoutes from './routes/notificationRoutes'
import stripeRoutes from './routes/stripeRoutes'
import holdedRoutes from './routes/holdedRoutes'
import { handleWebhook } from './controllers/StripeController'

const app = express()
const PORT = 3001

// Middleware
// CORS configuration - allow access from anywhere (Access-Control-Allow-Origin: *)
// NOTE: Since we use bearer tokens and not cookies, we don't need credentials here.
app.use(cors({
  origin: '*',
  credentials: false,
}))

// Stripe webhook must use raw body for signature verification — mount before express.json()
app.use(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res, next) => {
    try {
      await connectDatabase()
      next()
    } catch (err) {
      console.error('DB connection failed before webhook:', err)
      res.status(503).json({ success: false, message: 'Service temporarily unavailable.' })
    }
  },
  handleWebhook
)

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Ensure database is connected before handling API routes (fixes serverless buffering timeout)
app.use('/api', async (req, res, next) => {
  try {
    await connectDatabase()
    next()
  } catch (err) {
    console.error('DB connection failed before request:', err)
    res.status(503).json({ success: false, message: 'Service temporarily unavailable. Please try again.' })
  }
})

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' })
})

// TEMP: simple test endpoint to send a styled email to verify logo/layout.
// Hit: GET http://localhost:3001/api/test-email
app.get('/api/test-email', async (req, res) => {
  try {
    await sendClientDashboardEmail(
      'aryanarshad5413@gmail.com',
      'Test Client',
      'TEST_PROJECT_ID',
      'Test Project for Styling'
    )
    res.json({ success: true, message: 'Test email sent to aryanarshad5413@gmail.com' })
  } catch (err: any) {
    console.error('Failed to send test email:', err?.message || err)
    res.status(500).json({ success: false, message: err?.message || 'Failed to send test email' })
  }
})

// API Routes
app.use('/api/auth', authRoutes)
app.use('/api/projects', projectRoutes)
app.use('/api/services', serviceRoutes)
app.use('/api/payments', paymentRoutes)
app.use('/api/briefings', briefingRoutes)
app.use('/api/upload', uploadRoutes)
app.use('/api/custom-quotes', customQuoteRoutes)
app.use('/api/collaborators', collaboratorRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/stripe', stripeRoutes)
app.use('/api/holded', holdedRoutes)

// Error handling
app.use(errorHandler)

// Export app for Vercel serverless functions and local usage
export default app

// Connect to database and start server when running locally via `node dist/index.js`
// Vercel will use the default export and won't call this block.
if (require.main === module) {
  connectDatabase().then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`)
      console.log(`📡 API endpoints available at http://localhost:${PORT}/api`)
      console.log(`☁️  Cloudinary configured for image uploads`)
    })
  }).catch(console.error)
}
