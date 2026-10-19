import type { Response, NextFunction } from "express";
import {
    authenticate,
    type AuthenticatedRequest,
} from "./auth.middleware.js";

// For routes that work for guests AND logged-in users (for example placing an order).
// - No Authorization header: the request continues as a guest.
// - Header present: the token is checked exactly like authenticate(), so a bad or
//   expired token gets a 401 instead of silently becoming a guest order.
export const optionalAuthenticate = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    if (!req.headers.authorization) {
        next();
        return;
    }

    await authenticate()(req, res, next);
};