import "dotenv/config";
import dns from "node:dns";
import { isIP } from "node:net";
import app from "./app.js";

// DNS servers. Some home networks cannot resolve the Neon database host, so local development
// keeps using Google DNS as before. In production (Render) the platform DNS is used, unless
// DNS_SERVERS is set, for example DNS_SERVERS="8.8.8.8,8.8.4.4".
const rawDns = process.env["DNS_SERVERS"]
    ?.split(",")
    .map((server) => server.trim())
    .filter((server) => server.length > 0);
const customDnsIsValid = Boolean(rawDns?.length) && rawDns!.every((server) => isIP(server) !== 0);

if (customDnsIsValid) {
    dns.setServers(rawDns!);
} else if (rawDns?.length) {
    console.warn("Ignoring DNS_SERVERS because it contains an invalid IP address; using the platform resolver.");
} else if (process.env["NODE_ENV"] !== "production") {
    dns.setServers(["8.8.8.8", "8.8.4.4"]);
}

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
