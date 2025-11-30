import mongoose from 'mongoose';
const { Schema } = mongoose;

//store adminActions (by which admin) taken in past..(keep Track)

//isVerified (true/false), isDelete (banned fakeGymOwners), viewWalletTransaction,...

const adminActionSchema = new Schema({
  gymId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Gym', 
    required: true 
  },
  actionType: { 
    type: String, 
    enum: ['Verification', 'Suspension', 'FeatureUpdate', 'ContentModeration', 'Other'],
    required: true 
  },
  notes: { type: String },
  actionData: { type: Schema.Types.Mixed },
  performedBy: { 
    type: Schema.Types.ObjectId, 
    ref: 'Admin', //UserModel
    required: true 
  }
}, { timestamps: true });

export default mongoose.model('AdminAction', adminActionSchema);