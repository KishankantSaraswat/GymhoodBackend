import mongoose from 'mongoose';
const { Schema } = mongoose;

const walletTransactionSchema = new Schema({
  userId: {      
    type: Schema.Types.ObjectId, 
    ref: 'User', 
     required: [true, 'User ID is required']
  },
  amount: {  
    type: Number, 
    required: true 
  },
  type: { 
    type: String, 
    enum: ['Credit', 'Debit'], 
    required: true 
  },
  status: {
    type: String,
    enum: ['Pending', 'Completed', 'Failed', 'Refunded'],
    default: 'Pending'
  },
//   status: {
//   type: String,
//   enum: {
//     values: ['Pending', 'Completed', 'Failed'],
//     message: '{VALUE} is not a valid status'
//   },
//   default: 'Pending'
// }
  razorpayOrderId: {
    type: String,
    // index: true
  },
  // [MONGOOSE] Warning: Duplicate schema index on {"razorpayOrderId":1} found. This is often due to declaring an index using both "index: true" and "schema.index()". Please remove the duplicate index definition. 
  razorpayPaymentId: {
    type: String,
    index: true
  },
  razorpayRefundId: {
    type: String
  },
  reason: { 
    type: String,
    index: true 
  },
  transactionDate: { 
    type: Date, 
    default: Date.now 
  },
  // reason: { 
  //   type: String,
  //   enum: [
  //     'admin payment to gym',
  //     'revenue share',
  //     'refund to user',
  //     'plan purchase',
  //     'wallet topup',
  //     'other'
  //   ],
  //   index: true
  // },
  adminTransferTxnId: {
    type: String,
    index: true
  },
  adminNotes: {
    type: String
  },
  metadata: {
    planId: { type: Schema.Types.ObjectId, ref: 'Plan' },
    gymId: { type: Schema.Types.ObjectId, ref: 'Gym' },
    userPlanId: { type: Schema.Types.ObjectId, ref: 'UserPlan' },
    gymShare: Number,
    platformShare: Number,
    refundReason: String,
    relatedTransaction: { type: Schema.Types.ObjectId, ref: 'WalletTransaction' }
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
walletTransactionSchema.index({ userId: 1 });
walletTransactionSchema.index({ razorpayOrderId: 1 });
walletTransactionSchema.index({ 'metadata.planId': 1 });
walletTransactionSchema.index({ 'metadata.gymId': 1 });
walletTransactionSchema.index({ createdAt: 1 });

export default mongoose.model('WalletTransaction', walletTransactionSchema);


