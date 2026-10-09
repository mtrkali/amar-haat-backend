import type { Request, Response } from "express";
import { userService } from "./user.service.js";

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

export const userController = {
    getUser,
    registerUser,
};