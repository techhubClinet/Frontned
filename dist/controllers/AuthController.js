"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const User_1 = require("../models/User");
const Collaborator_1 = require("../models/Collaborator");
const response_1 = require("../views/response");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
// Hardcoded JWT secret
const JWT_SECRET = 'your-secret-key-change-in-production-please-change-this-in-production';
// Generate JWT token
const generateToken = (userId, email, role) => {
    return jsonwebtoken_1.default.sign({ userId, email, role }, JWT_SECRET, { expiresIn: '30d' });
};
class AuthController {
    // User signup
    static async signup(req, res) {
        try {
            const { name, email, password } = req.body;
            if (!name || !email || !password) {
                return response_1.ApiResponse.error(res, 'Name, email, and password are required', 400);
            }
            if (password.length < 6) {
                return response_1.ApiResponse.error(res, 'Password must be at least 6 characters', 400);
            }
            // Check if user already exists
            const existingUser = await User_1.User.findOne({ email: email.toLowerCase() });
            if (existingUser) {
                return response_1.ApiResponse.error(res, 'User with this email already exists', 400);
            }
            // Create new user
            const user = await User_1.User.create({
                name,
                email: email.toLowerCase(),
                password,
                role: 'client',
            });
            // Generate token
            const token = generateToken(user._id.toString(), user.email, user.role);
            return response_1.ApiResponse.success(res, {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    isCollaborator: false,
                },
                token,
            }, 'User created successfully', 201);
        }
        catch (error) {
            return response_1.ApiResponse.error(res, error.message, 500);
        }
    }
    // User login
    static async login(req, res) {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                return response_1.ApiResponse.error(res, 'Email and password are required', 400);
            }
            const normalizedEmail = email.toLowerCase();
            // Find user
            let user = await User_1.User.findOne({ email: normalizedEmail });
            // If no user found, allow hardcoded admin credentials to create the admin user on first login
            if (!user && normalizedEmail === 'admin1234@gmail.com' && password === 'admin1234') {
                user = await User_1.User.create({
                    name: 'Admin',
                    email: normalizedEmail,
                    password,
                    role: 'admin',
                });
            }
            if (!user) {
                return response_1.ApiResponse.error(res, 'Invalid email or password', 401);
            }
            // Check password
            const isMatch = await user.comparePassword(password);
            if (!isMatch) {
                return response_1.ApiResponse.error(res, 'Invalid email or password', 401);
            }
            // User can be both client and collaborator (same email); frontend uses this to show collaborator access
            const collaboratorProfile = await Collaborator_1.Collaborator.findOne({ user_id: user._id });
            // Generate token
            const token = generateToken(user._id.toString(), user.email, user.role);
            return response_1.ApiResponse.success(res, {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    isCollaborator: !!collaboratorProfile,
                },
                token,
            });
        }
        catch (error) {
            return response_1.ApiResponse.error(res, error.message, 500);
        }
    }
    // Get current user (protected route)
    static async getCurrentUser(req, res) {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                return response_1.ApiResponse.error(res, 'User not authenticated', 401);
            }
            const user = await User_1.User.findById(userId).select('-password');
            if (!user) {
                return response_1.ApiResponse.error(res, 'User not found', 404);
            }
            const collaboratorProfile = await Collaborator_1.Collaborator.findOne({ user_id: user._id });
            return response_1.ApiResponse.success(res, {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                isCollaborator: !!collaboratorProfile,
            });
        }
        catch (error) {
            return response_1.ApiResponse.error(res, error.message, 500);
        }
    }
}
exports.AuthController = AuthController;
