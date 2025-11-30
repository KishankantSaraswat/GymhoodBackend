import express from "express";
import {
  createUserData,
  updateUserData,
  deleteUserData,
  getUserData,
} from "../controllers/userDataController.js";

const router = express.Router();

router.post("/:userId", createUserData);
router.get("/:userId", getUserData);
router.put("/:userId", updateUserData);
router.delete("/:userId", deleteUserData);

export default router;
