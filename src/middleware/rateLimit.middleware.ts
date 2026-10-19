import { rateLimit } from "express-rate-limit";

// Every limiter counts requests per IP address and answers with a normal JSON error
// (HTTP 429) when the limit is passed. The limits are deliberately generous for real
// people and tight for bots. Counters live in memory, so they reset when the server
// restarts, which is fine for a single Render instance.

const tooMany = (message: string) => ({ success: false, message });

// Everything, as a basic shield against floods.
export const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: tooMany("Too many requests. Please try again in a few minutes."),
});

// Login and registration: stops password guessing and fake sign-ups.
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: tooMany("Too many attempts. Please try again in 15 minutes."),
});

// Placing orders: stops fake order floods (guests need no account).
export const orderLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: tooMany("Too many orders from this connection. Please try again later."),
});

// Reviews.
export const reviewLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 15,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: tooMany("Too many reviews submitted. Please try again later."),
});