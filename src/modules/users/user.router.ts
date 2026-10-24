import express from "express";
import { userController } from "./user.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";

const router = express.Router();

// Only ADMIN can access all users.
router.get("/", authenticate("ADMIN"), userController.getUser);
router.patch("/:id/status", authenticate("ADMIN"), userController.updateUserStatus);

// Any authenticated user can access their own profile.
router.get("/me", authenticate(), userController.getMyProfile);

// Any authenticated user can update their own profile.
router.patch("/me", authenticate(), userController.updateMyProfile);

// Public registration route.
router.post("/register", userController.registerUser);

// Public login route.
router.post("/login", userController.loginUser);

export const userRoute = router;


// "email": "testuser101@example.com",
//  "password": "TestPass123!"
