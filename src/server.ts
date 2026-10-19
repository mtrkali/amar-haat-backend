import dns from "node:dns";
import dotenv from "dotenv";
import app from "./app.js";

// Google DNS configuration
dns.setServers(["8.8.8.8", "8.8.4.4"]);

dotenv.config();

// Stop at start-up with a clear message, instead of failing later on the first login or query.
for (const name of ["DATABASE_URL", "JWT_SECRET"]) {
    if (!process.env[name]) {
        console.error(`Missing required environment variable: ${name}`);
        process.exit(1);
    }
}

if (process.env["NODE_ENV"] === "production" && !process.env["CORS_ORIGIN"]) {
    console.warn("CORS_ORIGIN is not set, so every website can call this API.");
}

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Amar Haat server running on port ${PORT}`);
});