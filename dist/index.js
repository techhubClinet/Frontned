"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const database_1 = require("./config/database");
const errorHandler_1 = require("./middleware/errorHandler");
const emailService_1 = require("./services/emailService");
const deliveryController_1 = require("./controllers/deliveryController");
// Routes
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const projectRoutes_1 = __importDefault(require("./routes/projectRoutes"));
const serviceRoutes_1 = __importDefault(require("./routes/serviceRoutes"));
const paymentRoutes_1 = __importDefault(require("./routes/paymentRoutes"));
const briefingRoutes_1 = __importDefault(require("./routes/briefingRoutes"));
const uploadRoutes_1 = __importDefault(require("./routes/uploadRoutes"));
const customQuoteRoutes_1 = __importDefault(require("./routes/customQuoteRoutes"));
const collaboratorRoutes_1 = __importDefault(require("./routes/collaboratorRoutes"));
const notificationRoutes_1 = __importDefault(require("./routes/notificationRoutes"));
const stripeRoutes_1 = __importDefault(require("./routes/stripeRoutes"));
const holdedRoutes_1 = __importDefault(require("./routes/holdedRoutes"));
const StripeController_1 = require("./controllers/StripeController");
const app = (0, express_1.default)();
const PORT = 3001;
// Middleware
// CORS configuration - allow access from anywhere (Access-Control-Allow-Origin: *)
// NOTE: Since we use bearer tokens and not cookies, we don't need credentials here.
app.use((0, cors_1.default)({
    origin: '*',
    credentials: false,
}));
// Stripe webhook must use raw body for signature verification — mount before express.json()
app.use('/api/stripe/webhook', express_1.default.raw({ type: 'application/json' }), async (req, res, next) => {
    try {
        await (0, database_1.connectDatabase)();
        next();
    }
    catch (err) {
        console.error('DB connection failed before webhook:', err);
        res.status(503).json({ success: false, message: 'Service temporarily unavailable.' });
    }
}, StripeController_1.handleWebhook);
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Ensure database is connected before handling API routes (fixes serverless buffering timeout)
app.use('/api', async (req, res, next) => {
    try {
        await (0, database_1.connectDatabase)();
        next();
    }
    catch (err) {
        console.error('DB connection failed before request:', err);
        res.status(503).json({ success: false, message: 'Service temporarily unavailable. Please try again.' });
    }
});
// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});
// Public delivery redirect (no auth) – must be before /api so it's at app root
app.get('/delivery/:token', async (req, res, next) => {
    try {
        await (0, database_1.connectDatabase)();
        next();
    }
    catch (err) {
        console.error('DB connection failed before delivery redirect:', err);
        res.status(503).send('Service unavailable');
    }
}, deliveryController_1.deliveryRedirect);
// Test endpoint to send a styled email (disabled in production to avoid abuse).
// GET /api/test-email?to=your@email.com (optional: without ?to= sends to a default address)
app.get('/api/test-email', async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(404).json({ success: false, message: 'Not found' });
    }
    const to = req.query.to || 'clients@kanridesign.com';
    try {
        const result = await (0, emailService_1.sendClientDashboardEmail)(to, 'Test Client', 'TEST_PROJECT_ID', 'Test Project for Email');
        if (!result.success) {
            return res.status(500).json({
                success: false,
                message: result.error || 'Email was not sent. Check backend terminal for details.',
            });
        }
        res.json({ success: true, message: `Test email sent to ${to}. Check inbox and backend logs.` });
    }
    catch (err) {
        console.error('Failed to send test email:', err?.message || err);
        res.status(500).json({ success: false, message: err?.message || 'Failed to send test email' });
    }
});
// API Routes
app.use('/api/auth', authRoutes_1.default);
app.use('/api/projects', projectRoutes_1.default);
app.use('/api/services', serviceRoutes_1.default);
app.use('/api/payments', paymentRoutes_1.default);
app.use('/api/briefings', briefingRoutes_1.default);
app.use('/api/upload', uploadRoutes_1.default);
app.use('/api/custom-quotes', customQuoteRoutes_1.default);
app.use('/api/collaborators', collaboratorRoutes_1.default);
app.use('/api/notifications', notificationRoutes_1.default);
app.use('/api/stripe', stripeRoutes_1.default);
app.use('/api/holded', holdedRoutes_1.default);
// Error handling
app.use(errorHandler_1.errorHandler);
// Export app for Vercel serverless functions and local usage
exports.default = app;
// Connect to database and start server when running locally via `node dist/index.js`
// Vercel will use the default export and won't call this block.
if (require.main === module) {
    (0, database_1.connectDatabase)().then(() => {
        app.listen(PORT, () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
            console.log(`📡 API endpoints available at http://localhost:${PORT}/api`);
            console.log(`☁️  Cloudinary configured for image uploads`);
        });
    }).catch(console.error);
}
