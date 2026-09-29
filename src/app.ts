import express from "express";
import cors from "cors";
import { healthRoute } from "./modules/health/health.router.js";
import { userRoute } from "./modules/users/user.router.js";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/health", healthRoute);
app.use("/users", userRoute);

export default app;