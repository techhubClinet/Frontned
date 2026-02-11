// Vercel serverless function entry point
// IMPORTANT: In Vercel, this file is compiled from TypeScript, so we import from src.
import app from '../src/index'
import { connectDatabase } from '../src/config/database'

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

