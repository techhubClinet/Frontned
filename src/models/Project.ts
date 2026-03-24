import mongoose, { Schema, Document } from 'mongoose'

export interface IProject extends Document {
  name: string
  client_name: string
  client_email?: string
  client_user?: mongoose.Types.ObjectId // Link to User account
  project_type: 'simple' | 'custom' // Simple = predefined services, Custom = custom quote needed
  status: 'pending' | 'in_progress' | 'review' | 'completed' | 'revision'
  payment_status: 'pending' | 'paid' | 'failed'
  stripe_payment_id?: string
  stripe_customer_id?: string
  billing_company_name?: string
  billing_tax_ids?: string[]
  payment_confirmation_email_sent_at?: Date
  selected_service?: mongoose.Types.ObjectId
  service_name?: string // Service name for simple projects (predefined services)
  service_price?: number // Price for simple projects (predefined services)
  service_price_eur?: number // Price in EUR for simple projects (optional)
  service_description?: string // Catalog description for predefined services
  custom_quote_amount?: number
  custom_quote_request?: mongoose.Types.ObjectId // Link to CustomQuote
  custom_quote_description?: string // Admin's description explaining the quote/pricing
  delivery_timeline?: string
  assigned_collaborator?: mongoose.Types.ObjectId // Reference to Collaborator
  collaborator_payment_amount?: number // Amount collaborator will be paid for this project
  collaborator_paid?: boolean // Whether collaborator has been paid out
  collaborator_paid_at?: Date // When collaborator payout happened
  collaborator_transfer_id?: string // Stripe transfer id for collaborator payout
  invoice_url?: string // Invoice document URL (uploaded by collaborator)
  invoice_public_id?: string // Cloudinary public_id for the invoice (for API access)
  invoice_status?: 'pending' | 'approved' | 'rejected' | 'payment_completed' // Invoice approval status
  invoice_visible_to_client?: boolean // Set true after payment so client panel shows invoice
  invoice_uploaded_at?: Date // When invoice was uploaded
  invoice_approved_at?: Date // When invoice was approved by admin
  invoice_type?: 'per-project' | 'monthly' // Type of invoice (per-project or monthly combined)
  monthly_invoice_id?: string // For monthly invoices: unique ID to group projects in the same monthly invoice
  monthly_invoice_month?: string // Format: "YYYY-MM" (e.g., "2024-01")
  holded_document_id?: string // Holded official invoice document ID (for syncing with Holded)
  holded_invoice_status?: string // Raw status from Holded (e.g. draft, approved, cancelled)
  currency?: 'usd' | 'eur'
  deliveryUrl?: string // Original delivery URL (private)
  deliveryToken?: string // Secure token for masked link
  isDelivered?: boolean
  revisions_used?: number // Number of revisions claimed by client
  max_revisions?: number // Maximum number of revisions allowed (default 3)
  completed_at?: Date // When the project status was changed to 'completed'
  status_notes?: {
    pending?: string
    in_progress?: string
    review?: string
    completed?: string
    revision?: string
  } // Per-stage status descriptions visible to client/collaborator
  deadline?: Date
  created_at: Date
  updated_at: Date
}

const ProjectSchema = new Schema<IProject>(
  {
    name: { type: String, required: true },
    client_name: { type: String, required: true },
    client_email: { type: String },
    client_user: { type: Schema.Types.ObjectId, ref: 'User' },
    project_type: {
      type: String,
      enum: ['simple', 'custom'],
      default: 'simple',
    },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'review', 'completed', 'revision'],
      default: 'pending',
    },
    payment_status: {
      type: String,
      enum: ['pending', 'paid', 'failed'],
      default: 'pending',
    },
    stripe_payment_id: { type: String },
    stripe_customer_id: { type: String },
    billing_company_name: { type: String },
    billing_tax_ids: [{ type: String }],
    payment_confirmation_email_sent_at: { type: Date },
    selected_service: { type: Schema.Types.ObjectId, ref: 'Service' },
    service_name: { type: String },
    service_price: { type: Number },
    service_price_eur: { type: Number },
    service_description: { type: String },
    custom_quote_amount: { type: Number },
    custom_quote_request: { type: Schema.Types.ObjectId, ref: 'CustomQuote' },
    custom_quote_description: { type: String },
    delivery_timeline: { type: String },
    assigned_collaborator: { type: Schema.Types.ObjectId, ref: 'Collaborator' },
    collaborator_payment_amount: { type: Number },
    collaborator_paid: { type: Boolean, default: false },
    collaborator_paid_at: { type: Date },
    collaborator_transfer_id: { type: String },
    invoice_url: { type: String },
    invoice_public_id: { type: String },
    invoice_status: { type: String, enum: ['pending', 'approved', 'rejected', 'payment_completed'], default: 'pending' },
    invoice_visible_to_client: { type: Boolean },
    invoice_uploaded_at: { type: Date },
    invoice_approved_at: { type: Date },
    invoice_type: { type: String, enum: ['per-project', 'monthly'] },
    monthly_invoice_id: { type: String }, // Groups projects in the same monthly invoice
    monthly_invoice_month: { type: String }, // Format: "YYYY-MM"
    holded_document_id: { type: String },
    holded_invoice_status: { type: String },
    currency: { type: String, enum: ['usd', 'eur'] },
    deliveryUrl: { type: String },
    deliveryToken: { type: String },
    isDelivered: { type: Boolean, default: false },
    revisions_used: { type: Number, default: 0 },
    max_revisions: { type: Number, default: 3 },
    completed_at: { type: Date }, // Track when project was completed
    status_notes: {
      type: Map,
      of: String,
    },
    deadline: { type: Date },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
)

export const Project = mongoose.model<IProject>('Project', ProjectSchema)
