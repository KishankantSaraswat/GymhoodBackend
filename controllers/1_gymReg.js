import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddlewares.js";
import Gym from "../models/1_gymModel.js";
import GymMedia from "../models/2_gymMedialModel.js";
import {GymAnnouncement} from '../models/23_announcemenetModel.js';
import UserPlan from "../models/14_userPlanModel.js";
import VerificationDocument from "../models/1_verificationDoc.js";
import mongoose from "mongoose";



export const registerGym = catchAsyncErrors(async (req, res, next) => {
  const {
    name,
    location,
    gymSlogan,
    coordinates,
    capacity,
    openTime,
    closeTime,
    contactEmail,
    phone,
    about,
    equipmentList,
    shifts,
    // status
  } = req.body;

  // Verify user is a gym owner
  if (req.user.role !== 'GymOwner') {
    return next(new ErrorHandler("Only gym owners can register gyms", 403));
  }

   // ✅ Check if gym already exists for this owner
  const existingGym = await Gym.findOne({ owner: req.user._id });
  if (existingGym) {
    return next(new ErrorHandler("Only one gym can be registered per gym owner", 400));
  }


  //1. add condition, only 1 gym per gymOwner can create..
  const gym = await Gym.create({
    name,
    location: {
      address: location,
      coordinates: Array.isArray(coordinates) ? coordinates : [0, 0]
    },
    gymSlogan,
    capacity,
    openTime,
    closeTime,
    contactEmail,
    phone,
    about,
    equipmentList,
    shifts,
    owner: req.user._id,
    // status
  });

  res.status(201).json({
    success: true,
    message: "Gym registered successfully. Waiting for admin verification.",
    gym
  });
});


//add&Update gymMedia
export const addUpdateGymMedia = catchAsyncErrors(async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { mediaUrls = [], logoUrl } = req.body;
    const userId = req.user._id;

    // Validate input
    if (!Array.isArray(mediaUrls) || (logoUrl && typeof logoUrl !== 'string')) {
      throw new ErrorHandler("Invalid media data format", 400);
    }

    // Find gym with ownership check
    const gym = await Gym.findOne({ owner: userId }).session(session);
    if (!gym) {
      throw new ErrorHandler("Gym not found or unauthorized", 404);
    }

    // Process media updates
    let mediaDoc = await GymMedia.findOne({ gymId: gym._id }).session(session);

    if (mediaDoc) {
      // Completely replace mediaUrls array
      mediaDoc.mediaUrls = mediaUrls.filter(url => url.trim() !== "");
      
      // Update logo if provided
      if (logoUrl && logoUrl.trim() !== "") {
        mediaDoc.logoUrl = logoUrl;
      }
      
      await mediaDoc.save({ session });
    } else {
      // Create new media document
      mediaDoc = await GymMedia.create([{
        gymId: gym._id,
        mediaUrls: mediaUrls.filter(url => url.trim() !== ""),
        logoUrl: logoUrl?.trim() || ""
      }], { session });
    }

    // Ensure gym references the media document
    if (!gym.media || !gym.media.equals(mediaDoc._id)) {
      gym.media = mediaDoc._id;
      await gym.save({ session });
    }

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: "Media updated successfully",
      media: mediaDoc
    });

  } catch (error) {
    await session.abortTransaction();
    next(error);
  } finally {
    session.endSession();
  }
});


//getGymById
export const getGymDetails = catchAsyncErrors(async (req, res, next) => {
  const gym = await Gym.findById(req.params.id)
    .populate('media')
    .populate('owner', 'name email phone');
    // .populate('equipmentList'); //ie select not populate

  if (!gym || gym.isDeleted) {
    return next(new ErrorHandler("Gym not found", 404));
  }

  res.status(200).json({
    success: true,
    gym
  });
});

// {
//   "name": "Muscle Factory",
//   "contactEmail": "gym@example.com",
//   "equipmentList": ["Dumbbells", "Bench Press", "Treadmill"]
// }

//update equipment && all legitimate after gymVerified
export const updateGym = catchAsyncErrors(async (req, res, next) => {
  const updates = Object.keys(req.body);
  const allowedUpdates = ['name', 'capacity', 'openTime', 'closeTime', 
                        'contactEmail', 'phone', 'about', 'shifts', 'gymSlogan','equipmentList']; //status,gymMedia can updated from diffController, verifiedDocument->not allowed after verification
                        //location is not allowed to update

  const isValidOperation = updates.every(update => allowedUpdates.includes(update));

  if (!isValidOperation) {
    return next(new ErrorHandler("Invalid updates!", 400));
  }

  const gym = await Gym.findOne({
    _id: req.params.id,
    owner: req.user._id
  });

  if (!gym) {
    return next(new ErrorHandler("Gym not found or not authorized", 404));
  }

  updates.forEach(update => {
    // Special handling for location coordinates
    // if (update === 'location' && req.body.location.coordinates) {
    //   gym.location = {
    //     address: req.body.location.address || gym.location.address,
    //     coordinates: req.body.location.coordinates
    //   };
    // }
    if (update === 'equipmentList') {
      if (!Array.isArray(req.body.equipmentList)) {
        return next(new ErrorHandler("equipmentList must be an array", 400));
      }
      gym.equipmentList = req.body.equipmentList;
    } 
    else {
      gym[update] = req.body[update];
    }
  });

  await gym.save();

  res.status(200).json({
    success: true,
    message: "Gym updated successfully",
    gym
  });
});


export const getAllGyms = catchAsyncErrors(async (req, res, next) => {
  const { status, search, near } = req.query;
  const query = { isDeleted: false };

  if (status) query.status = status;
  if (search) query.name = { $regex: search, $options: 'i' };

  // Handle geospatial query
  if (near) {
    const [lat, lng, radius] = near.split(',').map(Number);
    query['location.coordinates'] = {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [lng, lat] // MongoDB uses [long, lat]
        },
        $maxDistance: radius || 5000 // default 5km
      }
    };
  }

  const gyms = await Gym.find(query)
    .populate('media')
    .populate('owner', 'name');

  res.status(200).json({
    success: true,
    count: gyms.length,
    gyms
  });
});

//provide gyms(verificationDoc & ownerDetails) by gymIds (can be used by Admin only), by gymOwner,  Admin (req.body->gymIds)
export const getGymsByOwner = catchAsyncErrors(async (req, res, next) => {
  const query = { isDeleted: false };
  
  if (req.user.role !== 'Admin') {
    query.owner = req.user._id;
  } else if (req.body.gymIds && req.user.role === 'Admin') {
    query._id = { $in: req.body.gymIds };
  }

  const gyms = await Gym.find(query)
    .populate('owner', 'name email')
    .populate('verificationDocuments') //fieldName is verificationDocument(s)**
    .populate('media');

  res.status(200).json({ success: true, gyms });
});

//open, closed
//maintainence(with updateGym or, useAnnouncement)
export const toggleGymStatus = catchAsyncErrors(async (req, res, next) => {
  const gym = await Gym.findOneAndUpdate(
    { 
      // _id: req.params.gymId,
      owner: req.user._id 
    },
    // status === 'open' ? 'closed' : 'open'
    { $set: { status: { $cond: { if: { $eq: ['$status', 'open'] }, then: 'closed', else: 'open' }} }},
    { new: true }// returns the updated document
  );
// ❌ No, .save() is not required.
  if (!gym) {
    return next(new ErrorHandler("Gym not found or unauthorized", 404));
  }

  res.status(200).json({ success: true, gym });
});


//same handel, addition && updation of verificationDocument till isVerified:false
export const addUpdateVerificationDocuments = catchAsyncErrors(async (req, res, next) => {
  const { documentUrls = [] } = req.body;
  // const { gymId } = req.params;
  // 🔍 Find the gym that this user owns
  const gym = await Gym.findOne({ owner: req.user._id });
  if (!gym) {
    return next(new ErrorHandler('Gym not found for this user.', 404));
  }

  // const gymId = gym._id;

  if (gym.isVerified) {
    return next(new ErrorHandler("Cannot update documents after verification", 400));
  }

  let doc = await VerificationDocument.findOneAndUpdate(
    { gymId: gym._id },
    { documentUrls },
    { new: true, upsert: true }
  );

  // Update reference if new document
  if (!gym.verificationDocuments) {
    gym.verificationDocuments = doc._id;
    await gym.save();
  }

  res.status(200).json({ success: true, message: "Documents updated", doc });
});

// Gym-specific announcements
export const createGymAnnouncement = catchAsyncErrors(async (req, res, next) => {
  const { message } = req.body;
  // const { gymId } = req.params;

   
   // 🔍 Find the gym that this user owns
  const gym = await Gym.findOne({ owner: req.user._id });
  if (!gym) {
    return next(new ErrorHandler('Gym not found for this user.', 404));
  }

  const gymId = gym._id;


  if (!message) return next(new ErrorHandler("Message required", 400));



  // const userPlans = await UserPlan.find({ 
  //   gymId, 
  //   isExpired: false 
  // }).select('userId');

  const userPlans = await UserPlan.aggregate([
  { $match: { gymId: new mongoose.Types.ObjectId(gymId), isExpired: false } },
  {
    $group: {
      _id: "$userId", // group by userId
    }
  },
  {
    $project: {
      userId: "$_id",
      _id: 0
    }
  }
]);

  // console.log("userPlans: ", userPlans);
  
// const targetUsers = userPlans.length > 0 ? userPlans.map(p => p.userId) : [];
// Extract ObjectIds only
const targetUsers = userPlans.map(p => p.userId); // this works even if array is empty
  

  const announcement = await GymAnnouncement.create({
    gymId,
    message,
    // targetUsers: userPlans.map(plan => plan.userId),
    targetUsers,
    createdBy: req.user._id
  });

  res.status(201).json({ success: true, announcement });
});
//getAnnouncementFromGym && also, another route for getAnnouncementFromAdmin
export const getUserAnnouncementsByGym = catchAsyncErrors(async (req, res, next) => {
  const userId = req.user._id;
  const role=req.user.role;
  let gymIds = [];

  if (role === 'GymOwner') {
    const ownerGym = await Gym.findOne({ owner: userId }).select('_id');
    if (ownerGym) {
      gymIds = [ownerGym._id];
    }
  } else {
    const userPlans = await UserPlan.find({ userId, isExpired: false }).select('gymId');
    gymIds = userPlans.map(plan => plan.gymId);
  }

  if (!gymIds.length) {
    return res.status(200).json({ success: true, announcements: [] });
  }

  // const userPlans = await UserPlan.find({ userId, isExpired:false }).select('gymId'); //find user belongs to which-which gyms
  // const gymIds = userPlans.map(plan => plan.gymId); //if no userPlan..??

  const announcements = await GymAnnouncement.find({ gymId: { $in: gymIds } })
  .select('message gymId createdAt updatedAt') // Include 'message' and 'gymId' (needed for populate)
  .populate({
    path: 'gymId',
    select: 'name', // Only get the 'name' field from Gym
  }).sort({ createdAt: -1 });
    
    // .select('message') // Only include 'message' field

  res.status(200).json({ success: true, announcements });
});

export const deleteGymAnnouncement = catchAsyncErrors(async (req, res, next) => {
  // const { announcementId } = req.params;
  //   const userId = req.user._id;

  // const announcement = await GymAnnouncement.findById(announcementId);
  // if (!announcement) return next(new ErrorHandler("Announcement not found", 404));

  // if (!announcement.createdBy.equals(userId)) {
  //   return next(new ErrorHandler("Not authorized to delete this announcement", 403));
  // }

  const announcement = await GymAnnouncement.findOneAndDelete({
    _id: req.params.announcementId,
    createdBy: req.user._id
  });

  if (!announcement) {
    return next(new ErrorHandler("Announcement not found or unauthorized", 404));
  }

  await announcement.deleteOne();
  res.status(200).json({ success: true, message: "Announcement deleted" });
});

