import mongoose from 'mongoose';
const { Schema } = mongoose;

//provide specificGyms & specificUsers with help of getUserByQuery && getGymByQuery..
//addAnnouncement(admin->all, gym->gymUsers), deleteAnnouncement, getAnnouncement

const AnnouncementSchema = new Schema({
  title: { type: String},
  message: { type: String, required: true },
  // createdAt: { type: Date, default: Date.now },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }, // admin user

  // 🎯 Targeting Logic
  targetType: {
    type: String,
    enum: ['ALL_USERS', 'ALL_GYMS', 'SPECIFIC_GYMS', 'SPECIFIC_USERS'],
    default: 'ALL_USERS',
  },
  targetGyms: [{ type: Schema.Types.ObjectId, ref: 'User' }], //for gymOwner
  targetUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
},{timestamps:true});

const gymAnnouncementSchema = new mongoose.Schema({
  gymId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Gym',
    required: true
  },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }, // admin user
  message: {
    type: String,
    required: true
  },
  targetUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // createdAt: {
  //   type: Date,
  //   default: Date.now
  // }
},{timestamps:true});

export const GymAnnouncement = mongoose.model('GymAnnouncement', gymAnnouncementSchema);

export const Announcement= mongoose.model('AdminAnnouncement', AnnouncementSchema);
