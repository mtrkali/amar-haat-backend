import express from "express";
import type { Request, Response } from "express";
import { authenticate, type AuthenticatedRequest } from "../../middleware/auth.middleware.js";
import { paramString } from "../../utils/http.js";
import { deliveryService, METHODS, type DeliveryStatus } from "./delivery.service.js";

const router = express.Router();
const fail = (res: Response, status: number, message: string) => res.status(status).json({ success: false, message });

router.get("/methods", async (_req, res) => {
    try { res.json(await deliveryService.getMethods()); } catch (e) { console.error("Delivery methods failed", e); fail(res, 500, "Could not load delivery methods"); }
});
router.get("/options", async (req, res) => {
    const raw = req.query.slugs;
    const slugs = typeof raw === "string" ? raw.split(",").filter((x) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(x)) : [];
    if (!slugs.length || slugs.length > 50) return fail(res, 400, "Provide 1 to 50 product slugs");
    try { res.json(await deliveryService.getProductOptions(slugs)); } catch (e) { console.error("Delivery options failed", e); fail(res, 500, "Could not load delivery options"); }
});
router.patch("/products/:id/methods", authenticate("SELLER"), async (req: AuthenticatedRequest, res) => {
    const id = Number(paramString(req.params.id)); const methods = req.body?.methods;
    if (!Number.isInteger(id) || id < 1 || !Array.isArray(methods) || methods.length < 1 || methods.some((x: unknown) => !METHODS.includes(x as (typeof METHODS)[number])) || new Set(methods).size !== methods.length) return fail(res, 400, "Choose one or more supported delivery methods");
    try { const result = await deliveryService.setProductMethods(req.userId!, id, methods); result ? res.json(result) : fail(res, 404, "Your product was not found"); } catch (e) { console.error("Product delivery preference update failed", e); fail(res, 500, "Could not update product delivery methods"); }
});
router.patch("/methods", authenticate("ADMIN"), async (req, res) => {
    const methods = req.body?.methods;
    if (!Array.isArray(methods) || methods.length !== METHODS.length || new Set(methods.map((x: any) => x?.method)).size !== METHODS.length || methods.some((x: any) => !x || !METHODS.includes(x.method) || typeof x.enabled !== "boolean" || !Number.isInteger(x.fee) || x.fee < 0 || x.fee > 100000) || !methods.some((x: any) => x.enabled)) return fail(res, 400, "Provide every delivery method, keep one enabled, and enter valid fees");
    try { res.json(await deliveryService.saveMethods(methods)); } catch (e) { console.error("Delivery settings failed", e); fail(res, 500, "Could not save delivery settings"); }
});
router.get("/riders", authenticate("ADMIN"), async (_req, res) => { try { res.json(await deliveryService.listRiders()); } catch { fail(res, 500, "Could not load riders"); } });
router.post("/riders", authenticate("ADMIN"), async (req, res) => {
    const userId = req.body?.userId;
    if (!Number.isInteger(userId) || userId < 1) return fail(res, 400, "Valid userId is required");
    try { const result = await deliveryService.registerRider(userId); result ? res.status(201).json(result) : fail(res, 404, "Eligible customer account not found"); } catch (e) { console.error("Rider registration failed", e); fail(res, 500, "Could not register rider"); }
});
router.patch("/riders/:id/verification", authenticate("ADMIN"), async (req, res) => {
    const id = Number(paramString(req.params.id)); const status = req.body?.status;
    if (!Number.isInteger(id) || id < 1 || !["PENDING", "VERIFIED", "REJECTED"].includes(status)) return fail(res, 400, "Invalid rider or verification status");
    try { const result = await deliveryService.setVerification(id, status); result ? res.json(result) : fail(res, 404, "Rider not found"); } catch { fail(res, 500, "Could not update rider"); }
});
router.post("/orders/:id/assign", authenticate("ADMIN"), async (req, res) => {
    const orderId = Number(paramString(req.params.id)); const riderId = req.body?.riderId;
    if (!Number.isInteger(orderId) || orderId < 1 || !Number.isInteger(riderId) || riderId < 1) return fail(res, 400, "Valid orderId and riderId are required");
    try { const result = await deliveryService.assign(orderId, riderId); result ? res.json(result) : fail(res, 404, "Order or verified rider not found"); } catch (e) { console.error("Rider assignment failed", e); fail(res, 500, "Could not assign rider"); }
});
router.get("/rider/dashboard", authenticate("RIDER"), async (req: AuthenticatedRequest, res) => {
    try { const result = await deliveryService.riderDashboard(req.userId!); result ? res.json(result) : fail(res, 403, "Rider verification is required"); } catch { fail(res, 500, "Could not load rider dashboard"); }
});
router.patch("/rider/availability", authenticate("RIDER"), async (req: AuthenticatedRequest, res) => {
    if (typeof req.body?.isAvailable !== "boolean") return fail(res, 400, "isAvailable must be boolean");
    try { const result = await deliveryService.setAvailability(req.userId!, req.body.isAvailable); result ? res.json(result) : fail(res, 403, "Verified rider profile required"); } catch { fail(res, 500, "Could not update availability"); }
});
router.patch("/rider/deliveries/:id/status", authenticate("RIDER"), async (req: AuthenticatedRequest, res) => {
    const id = Number(paramString(req.params.id)); const status = req.body?.status as DeliveryStatus;
    if (!Number.isInteger(id) || id < 1 || !["ACCEPTED", "PICKED_UP", "DELIVERED", "FAILED"].includes(status)) return fail(res, 400, "Invalid delivery or status");
    try { const result = await deliveryService.setDeliveryStatus(req.userId!, id, status); result ? res.json(result) : fail(res, 409, "Delivery not found or transition is not allowed"); } catch { fail(res, 500, "Could not update delivery"); }
});
export const deliveryRoute = router;
