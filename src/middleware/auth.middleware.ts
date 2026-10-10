import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt.js";
import { userService } from "../modules/users/user.service.js";

export interface AuthenticatedRequest extends Request {
    userId?: number;
    userRole?: string;
}

export const authenticate =
    (...allowedRoles: string[]) =>
        async (
            req: AuthenticatedRequest,
            res: Response,
            next: NextFunction
        ): Promise<void> => {
            try {
                // Step 1: Read the Authorization header.
                const authHeader = req.headers.authorization;

                if (!authHeader || !authHeader.startsWith("Bearer ")) {
                    res.status(401).json({
                        success: false,
                        message: "Authentication token is required",
                    });
                    return;
                }

                // Step 2: Extract the token.
                const token = authHeader.split(" ")[1];

                if (!token) {
                    res.status(401).json({
                        success: false,
                        message: "Authentication token is required",
                    });
                    return;
                }

                // Step 3: Verify the JWT and get the user ID.
                const userId = verifyToken(token);

                // Step 4: Get the current user role and status from the database.
                const user = await userService.getUserRoleById(userId);

                // Step 5: Reject inactive accounts.
                if (user.status !== "ACTIVE") {
                    res.status(403).json({
                        success: false,
                        message: "Your account is not active",
                    });
                    return;
                }

                // Step 6: Attach user information to the request.
                req.userId = user.id;
                req.userRole = user.role;

                // Step 7: Check role permissions when required.
                if (
                    allowedRoles.length > 0 &&
                    !allowedRoles.includes(user.role)
                ) {
                    res.status(403).json({
                        success: false,
                        message: "You do not have permission to access this resource",
                    });
                    return;
                }

                // Step 8: Continue to the controller.
                next();
            } catch (error) {
                if (
                    error instanceof Error &&
                    error.message === "USER_NOT_FOUND"
                ) {
                    res.status(401).json({
                        success: false,
                        message: "User account not found",
                    });
                    return;
                }

                if (
                    error instanceof Error &&
                    (
                        error.name === "JsonWebTokenError" ||
                        error.name === "TokenExpiredError" ||
                        error.message === "Invalid token payload"
                    )
                ) {
                    res.status(401).json({
                        success: false,
                        message: "Invalid or expired authentication token",
                    });
                    return;
                }

                console.error("Authentication failed:", error);

                res.status(500).json({
                    success: false,
                    message: "Authentication failed",
                });
            }
        };