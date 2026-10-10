import express from "express";
import { userController } from "./user.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";

const router = express.Router();

// Only ADMIN can access all users.
router.get("/", authenticate("ADMIN"), userController.getUser);

// Any authenticated user can access their own profile.
router.get("/me", authenticate(), userController.getMyProfile);

// Public registration route.
router.post("/register", userController.registerUser);

// Public login route.
router.post("/login", userController.loginUser);

export const userRoute = router;
