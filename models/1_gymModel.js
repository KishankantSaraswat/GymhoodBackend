import mongoose from 'mongoose';
const { Schema } = mongoose;

const gymSchema = new Schema({
  name: {
    type: String,
    required: [true, 'Gym name is required'],
    trim: true,
    maxlength: [100, 'Gym name cannot exceed 100 characters']
  },
  gymSlogan: { type: String, maxlength: [500, 'Keep it short'] },
  location: {
    address: {
      type: String,
      required: [true, 'Address is required'],
      trim: true
    },
    coordinates: {
      type: [Number],  // [longitude, latitude]
      required: [true, 'Coordinates are required'],
      validate: {
        validator: function (coords) {
          return coords.length === 2 &&
            typeof coords[0] === 'number' &&
            typeof coords[1] === 'number';
        },
        message: 'Coordinates must be an array of two numbers [longitude, latitude]'
      }
    }
  },
  capacity: {
    type: Number,
    required: [true, 'Capacity is required'],
    min: [1, 'Capacity must be at least 1']
  },
  openTime: {
    type: String,
    required: [true, 'Opening time is required'],
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Please enter a valid time in HH:MM format']
  },
  closeTime: {
    type: String,
    required: [true, 'Closing time is required'],
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Please enter a valid time in HH:MM format'],
    validate: {
      validator: function (closingTime) {
        return this.openTime < closingTime;
      },
      message: 'Closing time must be after opening time'
    }
  },
  contactEmail: {
    type: String,
    required: [true, 'Contact email is required'],
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    match: [/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,6}$/, 'Please enter a valid phone number']
  },
  about: {
    type: String,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  equipmentList: {
    type: [String],
    validate: {
      validator: function (equipment) {
        return equipment.length <= 50; // Maximum 50 equipment items
      },
      message: 'Cannot have more than 50 equipment items'
    }
  },
  status: {
    type: String,
    enum: {
      values: ['open', 'closed', 'maintenance'],
      // message: 'Status must be either open, closed, active, inactive,pending, banned, or maintenance'
      message: 'Status must be either open, closed, maintenance'
    },
    default: 'open'
  },
  avgRating: {
    type: Number,
    default: 0,
    min: [0, 'Rating cannot be less than 0'],
    max: [5, 'Rating cannot be more than 5']
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  media: {
    type: Schema.Types.ObjectId,
    ref: 'GymMedia'
  },
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Gym owner is required'],
    index: true
  },
  // verificationDocuments: [{
  //   documentType: String,
  //   documentUrl: String,
  //   uploadedAt: Date
  // }], //selectFalse
  verificationDocuments: {
    type: Schema.Types.ObjectId,
    ref: 'verificationDocument'
  },
  // mongoose.model('VerificationDocument', verificationDocSchema);
  shifts: [{
    day: String,
    name: String, //morning,afternoon,evening
    startTime: String, //updateTimings..to manage gymOpens or, not
    endTime: String,
    capacity: Number,
    gender: {
      type: String,
      enum: ['male', 'female', 'unisex'],
      default: 'unisex'
    },
    notes: {
      type: String,
      default: '' // e.g., "Trainer available", "Zumba session", etc.
    }
  }],
  razorpayAccountId: String,
  kycVerified: {
    type: Boolean,
    default: false
  },
  //  gym.kycStatus = status;
  kycNotes: String,
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});


// Add 2dsphere index for geospatial queries
gymSchema.index({ 'location.coordinates': '2dsphere' });

// Virtual for formatted address
// gymSchema.virtual('formattedAddress').get(function() {
//   return `${this.location.address} (${this.location.coordinates[1]}, ${this.location.coordinates[0]})`;
// });

gymSchema.virtual('formattedAddress').get(function () {
  const lat = this.location?.coordinates?.[1];
  const lng = this.location?.coordinates?.[0];
  const address = this.location?.address ?? 'Unknown address';

  if (lat == null || lng == null) return `${address} (coordinates unavailable)`;
  return `${address} (${lat}, ${lng})`;
});

gymSchema.virtual('isOpen').get(function () {
  if (this.status && this.status !== 'open') return false;

  const now = new Date();
  const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const currentTime = now.getHours() * 60 + now.getMinutes();

  if (this.shifts && this.shifts.length > 0) {
    return this.shifts.some(shift => {
      if (shift.day.toLowerCase() !== currentDay) return false;
      const [startH, startM] = shift.startTime.split(':').map(Number);
      const [endH, endM] = shift.endTime.split(':').map(Number);
      const startTotal = startH * 60 + startM;
      const endTotal = endH * 60 + endM;
      if (endTotal > startTotal) return currentTime >= startTotal && currentTime < endTotal;
      return currentTime >= startTotal || currentTime < endTotal;
    });
  }

  if (!this.openTime || !this.closeTime) return false;
  const [openHours, openMinutes] = this.openTime.split(':').map(Number);
  const [closeHours, closeMinutes] = this.closeTime.split(':').map(Number);
  const openTotalMinutes = openHours * 60 + openMinutes;
  const closeTotalMinutes = closeHours * 60 + closeMinutes;

  if (closeTotalMinutes > openTotalMinutes) {
    return currentTime >= openTotalMinutes && currentTime < closeTotalMinutes;
  }
  return currentTime >= openTotalMinutes || currentTime < closeTotalMinutes;
});

gymSchema.virtual('currentStatus').get(function () {
  if (this.status && this.status !== 'open') return { isOpen: false, message: 'Closed (Maintenance)' };

  const now = new Date();
  const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const currentTime = now.getHours() * 60 + now.getMinutes();

  if (this.shifts && this.shifts.length > 0) {
    const activeShift = this.shifts.find(shift => {
      if (shift.day.toLowerCase() !== currentDay) return false;
      const [startH, startM] = shift.startTime.split(':').map(Number);
      const [endH, endM] = shift.endTime.split(':').map(Number);
      const startTotal = startH * 60 + startM;
      const endTotal = endH * 60 + endM;
      if (endTotal > startTotal) return currentTime >= startTotal && currentTime < endTotal;
      return currentTime >= startTotal || currentTime < endTotal;
    });

    if (activeShift) {
      let genderLabel = activeShift.gender;
      if (genderLabel === 'male') genderLabel = 'Men';
      else if (genderLabel === 'female') genderLabel = 'Female';
      else genderLabel = 'Unisex';

      return {
        isOpen: true,
        gender: activeShift.gender,
        message: `Open for ${genderLabel}`
      };
    }
  }

  return { isOpen: false, message: 'Closed' };
});


// Pre-save hook to ensure coordinates are in correct order [long, lat]
gymSchema.pre('save', function (next) {
  if (this.location.coordinates && this.location.coordinates.length === 2) {
    // Ensure longitude is between -180 and 180
    this.location.coordinates[0] = Math.max(-180, Math.min(180, this.location.coordinates[0]));
    // Ensure latitude is between -90 and 90
    this.location.coordinates[1] = Math.max(-90, Math.min(90, this.location.coordinates[1]));
  }
  next();
});

export default mongoose.model('Gym', gymSchema);
