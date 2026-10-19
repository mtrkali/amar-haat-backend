import dns from "node:dns";
import dotenv from "dotenv";
import app from "./app.js";

// Google DNS configuration
dns.setServers(["8.8.8.8", "8.8.4.4"]);

dotenv.config();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Amar Haat server running on port ${PORT}`);
});
