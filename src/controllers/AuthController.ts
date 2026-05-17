import { Request, Response } from 'express'
import { User } from '../models/User'
import { Collaborator } from '../models/Collaborator'
import { ApiResponse } from '../views/response'
import { isAdminEmail } from '../config/adminEmails'
import jwt from 'jsonwebtoken'

// Hardcoded JWT secret
const JWT_SECRET = 'your-secret-key-change-in-production-please-change-this-in-production'

// Generate JWT token
const generateToken = (userId: string, email: string, role: string) => {
  return jwt.sign(
    { userId, email, role },
    JWT_SECRET,
    { expiresIn: '30d' }
  )
}

export class AuthController {
  // User signup
  static async signup(req: Request, res: Response) {
    try {
      const { name, email, password } = req.body

      if (!name || !email || !password) {
        return ApiResponse.error(res, 'Name, email, and password are required', 400)
      }

      const trimmedPassword = typeof password === 'string' ? password.trim() : ''
      if (trimmedPassword.length < 6) {
        const len = trimmedPassword.length
        return ApiResponse.error(
          res,
          len === 0
            ? 'Password is required (at least 6 characters).'
            : `Password must be at least 6 characters (you entered ${len}).`,
          400
        )
      }

      const normalizedEmail = email.trim().toLowerCase()
      const trimmedName = name.trim()

      // Check if user already exists
      const existingUser = await User.findOne({ email: normalizedEmail })
      if (existingUser) {
        return ApiResponse.error(res, 'User with this email already exists', 400)
      }

      // Create new user
      const user = await User.create({
        name: trimmedName,
        email: normalizedEmail,
        password: trimmedPassword,
        role: 'client',
      })

      // Generate token
      const token = generateToken(user._id.toString(), user.email, user.role)

      return ApiResponse.success(
        res,
        {
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            isCollaborator: false,
          },
          token,
        },
        'User created successfully',
        201
      )
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500)
    }
  }

  // User login
  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body

      if (!email || !password) {
        return ApiResponse.error(res, 'Email and password are required', 400)
      }

      const normalizedEmail = email.toLowerCase()

      // Find user
      let user = await User.findOne({ email: normalizedEmail })
      const adminEmail = isAdminEmail(normalizedEmail)
      const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim()

      // First login for configured admin emails (optional shared bootstrap password in env)
      if (!user && adminEmail && bootstrapPassword && password === bootstrapPassword) {
        user = await User.create({
          name: normalizedEmail.split('@')[0] || 'Admin',
          email: normalizedEmail,
          password,
          role: 'admin',
        })
      }

      // Legacy bootstrap (keep for existing setups)
      if (!user && normalizedEmail === 'admin1234@gmail.com' && password === 'admin1234') {
        user = await User.create({
          name: 'Admin',
          email: normalizedEmail,
          password,
          role: 'admin',
        })
      }

      if (!user) {
        return ApiResponse.error(res, 'Invalid email or password', 401)
      }

      // Check password
      const isMatch = await user.comparePassword(password)
      if (!isMatch) {
        return ApiResponse.error(res, 'Invalid email or password', 401)
      }

      // Ensure configured admin emails always have admin role (e.g. signed up as client first)
      if (adminEmail && user.role !== 'admin') {
        user.role = 'admin'
        await user.save()
      }

      // User can be both client and collaborator (same email); frontend uses this to show collaborator access
      const collaboratorProfile = await Collaborator.findOne({ user_id: user._id })

      // Generate token
      const token = generateToken(user._id.toString(), user.email, user.role)

      return ApiResponse.success(res, {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          isCollaborator: !!collaboratorProfile,
        },
        token,
      })
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500)
    }
  }

  // Get current user (protected route)
  static async getCurrentUser(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.userId

      if (!userId) {
        return ApiResponse.error(res, 'User not authenticated', 401)
      }

      const user = await User.findById(userId).select('-password')
      if (!user) {
        return ApiResponse.error(res, 'User not found', 404)
      }

      const collaboratorProfile = await Collaborator.findOne({ user_id: user._id })

      return ApiResponse.success(res, {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isCollaborator: !!collaboratorProfile,
      })
    } catch (error: any) {
      return ApiResponse.error(res, error.message, 500)
    }
  }
}




