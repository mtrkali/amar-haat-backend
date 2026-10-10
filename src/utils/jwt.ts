import jwt from "jsonwebtoken";

const getJwtSecret = (): string => {
    const secret = process.env["JWT_SECRET"];

    if (!secret) {
        throw new Error("JWT_SECRET is not configured");
    }

    return secret;
};

// Generate JWT access token
export const generateToken = (userId: number): string => {
    return jwt.sign(
        { sub: userId },
        getJwtSecret(),
        { expiresIn: "1h" }
    );
};

// Verify JWT access token
export const verifyToken = (token: string): number => {
    const decoded = jwt.verify(token, getJwtSecret());

    if (
        typeof decoded === "string" ||
        typeof decoded.sub !== "number"
    ) {
        throw new Error("Invalid token payload");
    }

    return decoded.sub;
};