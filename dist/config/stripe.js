"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStripeWebhookSecret = exports.getStripe = void 0;
const stripe_1 = __importDefault(require("stripe"));
let stripeInstance = null;
const getStripe = () => {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
        throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    if (!stripeInstance) {
        stripeInstance = new stripe_1.default(stripeSecretKey, {
            apiVersion: '2025-12-15.clover',
        });
    }
    return stripeInstance;
};
exports.getStripe = getStripe;
const getStripeWebhookSecret = () => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
        throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
    }
    return webhookSecret;
};
exports.getStripeWebhookSecret = getStripeWebhookSecret;
