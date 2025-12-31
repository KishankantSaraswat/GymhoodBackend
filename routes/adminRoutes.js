//1. get nonVerified Gym list (mark->isVerified: True, isDelete: True-->for ban)
//2. provide button to delete announcement (if gets unrelevant); post announcement to announcementModel (with targetAudience: Gyms/Users/List of gyms is storable)
//3. controller provide list of users && gym (a/c to location..etc..)
//2. mark verified or deleted to a gym &&&& get gymVerificationDocumentModel (gymId wise)
//2. announcement (post && get) to allUsers, Users Near a location, allGyms, gymList (1st get gym by location && then put that gymList)
//3. route to delete a plan (if Invalid) (Keeping in mind user buy that plan, so userPlan model use ...for no issue) 
//4. route to get WalletTransaction of a gym by gymId
//5. add & delete, admin by superAdmin (&& admin can do all work..) (superAdmin, allowed to all where admin allowed, but not vice versa)


// routes/gymAdminRoutes.js
import express from 'express';
import { isAuthenticated, isGymOwner, isAdmin } from "../middlewares/authMiddleware.js";
import { body, validationResult } from "express-validator";
import ErrorHandler from "../middlewares/errorMiddlewares.js";
import {
  toggleGymVerification,
  toggleGymDeletion,
  getUnverifiedGyms,
  getAllGymsForAdmin,
  createAnnouncement,


  getUsersByQuery,
  getGymsByQuery,
  getUserAnnouncements,
  deleteAnnouncement,
  updatePlanFactor,
  getPlansByQuery
} from '../controllers/2_adminController.js';

//   getActivePlans,
//   getInactivePlans,
//   deleteGymPlan,
//   createGymPlan,
//   add & getAdmin (getUserByQuery), toggleAdminRole

const router = express.Router();

router.put('/gym/:gymId/toggle-verify', isAuthenticated, isAdmin, toggleGymVerification);
router.put('/gym/:gymId/toggle-delete', isAuthenticated, isAdmin, toggleGymDeletion);
router.get('/gyms/unverified', isAuthenticated, isAdmin, getUnverifiedGyms);
router.get('/gyms/admin-all', isAuthenticated, isAdmin, getAllGymsForAdmin);

// User Management (users->get Users,GymOwner,Admin)
router.get("/users", isAuthenticated, isAdmin, getUsersByQuery);
// Gym Management
router.get("/gyms", isAuthenticated, isAdmin, getGymsByQuery); //add rating query also, (or, by frontend : easily)
// Announcement Management
router.post("/announcements",
  isAuthenticated,
  isAdmin,
  // validateAnnouncement,
  createAnnouncement
);
router.get("/announcements/user", isAuthenticated, getUserAnnouncements);
router.delete("/announcements/:announcementId", isAuthenticated, isAdmin, deleteAnnouncement);
router.get("/plans/search", getPlansByQuery);
router.put("/plans/factor",
  isAuthenticated,
  isAdmin,
  updatePlanFactor
);

export default router;