// Vercel serverless function entry point
// IMPORTANT: Use compiled JS from dist in the serverless runtime
import app from '../dist/index'
import { connectDatabase } from '../dist/config/database'

// Connect to database on cold start (Vercel serverless)
let isConnected = false

const connectDB = async () => {
  if (!isConnected) {
    try {
      await connectDatabase()
      isConnected = true
    } catch (error) {
      console.error('Database connection error:', error)
    }
  }
}


connectDB().catch(console.error)

export default app

