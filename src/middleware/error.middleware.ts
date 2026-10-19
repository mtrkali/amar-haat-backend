import type { NextFunction, Request, Response } from "express";

// Runs when no route matched the URL.
export const notFoundHandler = (_req: Request, res: Response): void => {
    res.status(404).json({
        success: false,
        message: "Route not found",
    });
};

// Runs when something throws outside a controller's own try/catch,
// for example a request with broken JSON. Without this, Express would
// answer with an HTML error page that the frontend cannot read.
export const errorHandler = (
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
): void => {
    const type =
        typeof error === "object" && error !== null && "type" in error
            ? String((error as { type: unknown }).type)
            : "";

    if (type === "entity.parse.failed") {
        res.status(400).json({
            success: false,
            message: "The request body is not valid JSON",
        });
        return;
    }

    if (type === "entity.too.large") {
        res.status(413).json({
            success: false,
            message: "The request body is too large",
        });
        return;
    }

    console.error("Unhandled error:", error);

    res.status(500).json({
        success: false,
        message: "Something went wrong on the server",
    });
};