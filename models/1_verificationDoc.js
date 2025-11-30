import mongoose from 'mongoose';

const verificationDocumentSchema = new mongoose.Schema({
  gymId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gym', required: true, unique: true },
  documentUrls: [{ type: String, required: true }]
});

export default mongoose.model('verificationDocument', verificationDocumentSchema);