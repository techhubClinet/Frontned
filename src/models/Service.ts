import mongoose, { Schema, Document } from 'mongoose'

export interface IService extends Document {
  name: string
  description: string
  price: number // legacy; treated as priceUSD when priceUSD not set
  priceUSD?: number
  priceEUR?: number
  delivery_timeline: string
  is_active: boolean
  created_at: Date
}

const ServiceSchema = new Schema<IService>(
  {
    name: { type: String, required: true },
    description: { type: String },
    price: { type: Number, required: true },
    priceUSD: { type: Number },
    priceEUR: { type: Number },
    delivery_timeline: { type: String, default: '30 days' },
    is_active: { type: Boolean, default: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: false },
  }
)

export const Service = mongoose.model<IService>('Service', ServiceSchema)
