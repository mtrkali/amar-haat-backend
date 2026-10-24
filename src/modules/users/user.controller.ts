import type { Request, Response } from "express";
import { userService } from "./user.service.js";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware.js";
import { isValidEmail, isValidPhone } from "../../utils/user.funtion.js";


const getUser = async (_req: Request, res: Response) => {
    try {
        const result = await userService.getUser();

        res.status(200).json(result);
    } catch (error) {
        console.error("Failed to fetch users:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch users",
        });
    }
};

const updateUserStatus = async (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params["id"]);
    const status = req.body?.status;
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, message: "Invalid user id" });
    if (status !== "ACTIVE" && status !== "INACTIVE" && status !== "SUSPENDED") {
        return res.status(400).json({ success: false, message: "status must be ACTIVE, INACTIVE, or SUSPENDED" });
    }
    if (typeof req.userId !== "number") return res.status(401).json({ success: false, message: "Authentication required" });
    try {
        return res.status(200).json(await userService.updateUserStatus(id, status, req.userId));
    } catch (error) {
        if (error instanceof Error && error.message === "USER_NOT_FOUND") return res.status(404).json({ success: false, message: "User not found" });
        if (error instanceof Error && error.message === "USER_STATUS_FORBIDDEN") return res.status(403).json({ success: false, message: "Admin accounts and your own account cannot be changed here" });
        console.error("Failed to update user status:", error);
        return res.status(500).json({ success: false, message: "Failed to update user status" });
    }
};


const getMyProfile = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    try {
        // Get the authenticated user's ID from the request.
        const userId = req.userId;

        if (typeof userId !== "number") {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        // Fetch the authenticated user's profile.
        const result = await userService.getUserById(userId);

        return res.status(200).json(result);
    } catch (error) {
        if (
            error instanceof Error &&
            error.message === "USER_NOT_FOUND"
        ) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        console.error("Failed to fetch profile:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch profile",
        });
    }
};


const updateMyProfile = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    try {
        const userId = req.userId;

        // Ensure the user is authenticated.
        if (typeof userId !== "number") {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            });
        }

        const { name, phone } = req.body;

        // Reject attempts to update protected fields.
        const restrictedFields = [
            "email",
            "password",
            "passwordHash",
            "role",
            "status",
            "emailVerified",
            "phoneVerified",
        ];

        const attemptedRestrictedField = restrictedFields.some(
            (field) =>
                Object.prototype.hasOwnProperty.call(req.body, field)
        );

        if (attemptedRestrictedField) {
            return res.status(400).json({
                success: false,
                message:
                    "You can only update your name and phone number",
            });
        }

        // Validate the name if provided.
        if (name !== undefined) {
            if (typeof name !== "string" || !name.trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Name must be a non-empty string",
                });
            }
        }

        // Validate the phone number if provided.
        if (phone !== undefined) {
            if (
                typeof phone !== "string" ||
                !isValidPhone(phone.trim())
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Please provide a valid phone number",
                });
            }
        }

        // Require at least one field to update.
        if (name === undefined && phone === undefined) {
            return res.status(400).json({
                success: false,
                message: "Provide a name or phone number to update",
            });
        }

        // Update the authenticated user's profile.
        const result = await userService.updateMyProfile(userId, {
            ...(name !== undefined && { name: name.trim() }),
            ...(phone !== undefined && { phone: phone.trim() }),
        });

        return res.status(200).json(result);
    } catch (error) {
        if (error instanceof Error) {
            if (error.message === "USER_NOT_FOUND") {
                return res.status(404).json({
                    success: false,
                    message: "User not found",
                });
            }

            if (error.message === "PHONE_ALREADY_EXISTS") {
                return res.status(409).json({
                    success: false,
                    message: "Phone number is already registered",
                });
            }
        }

        console.error("Profile update failed:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to update profile",
        });
    }
};

const registerUser = async (req: Request, res: Response) => {
    try {
        const { name, email, phone, password } = req.body;

        // Basic request validation
        if (
            typeof name !== "string" ||
            typeof email !== "string" ||
            typeof phone !== "string" ||
            typeof password !== "string" ||
            !name.trim() ||
            !email.trim() ||
            !phone.trim() ||
            !password
        ) {
            return res.status(400).json({
                success: false,
                message: "Name, email, phone, and password are required",
            });
        }

        if (!isValidEmail(email.trim())) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid email address",
            });
        }

        if (!isValidPhone(phone.trim())) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid phone number",
            });
        }

        if (
            password.length < 8 ||
            !/[A-Z]/.test(password) ||
            !/[a-z]/.test(password) ||
            !/[0-9]/.test(password)
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Password must be at least 8 characters long and contain an uppercase letter, a lowercase letter, and a number",
            });
        }

        const result = await userService.registerUser({
            name,
            email,
            phone,
            password,
        });

        return res.status(201).json(result);
    } catch (error) {
        if (error instanceof Error) {
            if (error.message === "EMAIL_ALREADY_EXISTS") {
                return res.status(409).json({
                    success: false,
                    message: "Email is already registered",
                });
            }

            if (error.message === "PHONE_ALREADY_EXISTS") {
                return res.status(409).json({
                    success: false,
                    message: "Phone number is already registered",
                });
            }
        }

        console.error("Registration failed:", error);

        return res.status(500).json({
            success: false,
            message: "Registration failed",
        });
    }
};



const loginUser = async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        // Validate required fields.
        if (
            typeof email !== "string" ||
            typeof password !== "string" ||
            !email.trim() ||
            !password
        ) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required",
            });
        }

        // Call the login service.
        const result = await userService.loginUser({
            email,
            password,
        });

        return res.status(200).json(result);
    } catch (error) {
        if (
            error instanceof Error &&
            error.message === "INVALID_CREDENTIALS"
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password",
            });
        }

        if (
            error instanceof Error &&
            error.message === "ACCOUNT_NOT_ACTIVE"
        ) {
            return res.status(403).json({
                success: false,
                message: "Your account is inactive or suspended",
            });
        }

        console.error("Login failed:", error);

        return res.status(500).json({
            success: false,
            message: "Login failed",
        });
    }
};


export const userController = {
    getUser,
    updateUserStatus,
    registerUser,
    loginUser,
    getMyProfile,
    updateMyProfile,
};
