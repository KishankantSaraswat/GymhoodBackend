import { catchAsyncErrors } from "../middlewares/catchAsyncErrors.js";
import ErrorHandler from "../middlewares/errorMiddlewares.js";
import Plan from "../models/3_planModel.js";
import  Gym  from "../models/1_gymModel.js";

// Create Plan (by isVerified:Ture && isDeleted:False)
export const createPlan = catchAsyncErrors(async (req, res, next) => {
  const {
    // gymId,
    name,
    validity,
    price,
    discountPercent,
    features,
    planType,
    isTrainerIncluded,
    duration
  } = req.body;

  const gym = await Gym.findOne({
  _id: req.params.gymId,
  owner: req.user._id,
  isVerified: true
});

if (!gym) {
  return next(new ErrorHandler("Gym not found, unauthorized, or not verified", 404));
}

    const gymId=req.params.gymId;


  if (gym.owner.toString() !== req.user._id.toString()) {
    return next(new ErrorHandler("Not authorized to create plans for this gym", 403));
  }

  let maxExpiryFactor = 1;

if (validity >= 1 && validity <= 2) {
  maxExpiryFactor = 7;
} else if (validity > 2 && validity <= 8) {
  maxExpiryFactor = 4;
} else if (validity > 8 && validity <= 16) {
  maxExpiryFactor = 6;
} else if (validity > 16 && validity <= 31) {
  maxExpiryFactor = 6;
}

  const plan = await Plan.create({
    gymId,
    name,
    validity,
    price,
    discountPercent,
    features,
    planType,
    isTrainerIncluded,
    duration,
    isActive: true,
     maxExpiryFactor 
  });

  res.status(201).json({
    success: true,
    message: "Plan created successfully",
    plan
  });
});

// Get Plans by user (isActive: true)
export const getGymPlans = catchAsyncErrors(async (req, res, next) => {
  const { gymId } = req.params;

  const plans = await Plan.find({ gymId, isActive: true })
    .sort({ price: 1 });

  res.status(200).json({
    success: true,
    count: plans.length,
    plans
  });
});

export const getPlanNameById = catchAsyncErrors(async (req, res, next) => {
  const { id } = req.params;

  if (!id) {
    return next(new ErrorHandler("Plan ID is required", 400));
  }

  const plan = await Plan.findById(id).select("name"); // Only fetch the plan name

  if (!plan) {
    return next(new ErrorHandler("Plan not found", 404));
  }

  res.status(200).json({
    success: true,
    planName: plan.name,
  });
});

// Get plans also (isActive: true && false)==>keep noted by frontend which for whom
export const getGymPlansAdminView = catchAsyncErrors(async (req, res, next) => {
  const { gymId } = req.params;

  // For admin - no ownership check
  if (req.user.role === 'Admin') {
    const plans = await Plan.find({ gymId }).sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      count: plans.length,
      plans
    });
  }

  // For gym owner - verify ownership
  const gym = await Gym.findOne({
    _id: gymId,
    owner: req.user._id
  });

  if (!gym) {
    return next(new ErrorHandler("Gym not found or not authorized", 404));
  }

  const plans = await Plan.find({ gymId }).sort({ createdAt: -1 });
  
  res.status(200).json({
    success: true,
    count: plans.length,
    plans
  });
});


//updatePlan->use for delete plan also, as can update the isActive button****
export const updatePlan = catchAsyncErrors(async (req, res, next) => {
  const {
    name,
    price,
    //validity, //not required to update (create New instead) 
    // **Something need to fix, so that revenueAnalytics will use to track effect of change in that parameter or revnue && analytics..
    // if want effect of validity-->create new plan && inactive previous plan
    // planType, //not required to update
    discountPercent,
    features,
    duration,
    isTrainerIncluded,
    isActive
  } = req.body;

  const plan = await Plan.findById(req.params.planId);
  if (!plan) {
    return next(new ErrorHandler("Plan not found", 404));
  }

  // Verify gym owner
  const gym = await Gym.findById(plan.gymId);
  if (!gym || gym.owner.toString() !== req.user._id.toString()) {
    return next(new ErrorHandler("Not authorized to modify this plan", 403));
  }

  // Update fields if provided
  if (name !== undefined) plan.name = name;
  if (price !== undefined) plan.price = price;
  if (discountPercent !== undefined) plan.discountPercent = discountPercent;
  if (features !== undefined) plan.features = features;
  if (duration !== undefined) plan.duration = duration;
  if (isTrainerIncluded !== undefined) plan.isTrainerIncluded = isTrainerIncluded;
  if (isActive !== undefined) plan.isActive = isActive;

  await plan.save();

  res.status(200).json({
    success: true,
    message: "Plan updated successfully",
    plan
  });
});

//deletePlan route (if want to change validity && type)-->keep userSafe (refer userPlan for userWorks)
//Not deletePlan (only mark: plan->'inactive', && gymOwner can see inActive plan if wants && userCan't see && buy inactivePlan)
//So gymOwner (with increase inActive plan, go for update or, make active previous Plan)****