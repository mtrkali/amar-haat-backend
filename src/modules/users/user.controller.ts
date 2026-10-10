import type { Request, Response } from "express";
import { userService } from "./user.service.js";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware.js";

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

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters long",
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

        console.error("Login failed:", error);

        return res.status(500).json({
            success: false,
            message: "Login failed",
        });
    }
};


export const userController = {
    getUser,
    registerUser,
    loginUser,
    getMyProfile
};