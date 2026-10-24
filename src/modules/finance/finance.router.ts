import express from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { financeService, FinanceError } from "./finance.service.js";
import { paramString } from "../../utils/http.js";

const router = express.Router();
router.get("/admin", authenticate("ADMIN"), async (_req, res) => {
    try { res.json(await financeService.getAdminSummary()); }
    catch (error) { console.error("Admin finance summary failed", error); res.status(500).json({ success: false, message: "Could not load financial summary" }); }
});
router.get("/seller", authenticate("SELLER"), async (req: AuthenticatedRequest, res) => {
    try { res.json(await financeService.getSellerSummary(req.userId!)); }
    catch (error) { if (error instanceof FinanceError) return res.status(404).json({ success: false, code: error.code, message: error.message }); console.error("Seller finance summary failed", error); res.status(500).json({ success: false, message: "Could not load seller financial summary" }); }
});
router.patch("/orders/:id/cod-collection", authenticate("ADMIN"), async (req: AuthenticatedRequest, res) => {
    const id = Number(paramString(req.params.id));
    const raw = req.body?.reference;
    const reference = typeof raw === "string" ? raw.trim() : null;
    if (!Number.isInteger(id) || id < 1 || (reference !== null && reference.length > 120)) return res.status(400).json({ success: false, message: "Invalid order ID or reference" });
    try { return res.json(await financeService.collectCod(id, req.userId!, reference || null)); }
    catch (error) { if (error instanceof FinanceError) return res.status(409).json({ success: false, code: error.code, message: error.message }); console.error("COD collection update failed", error); return res.status(500).json({ success: false, message: "Could not record COD collection" }); }
});
router.patch("/commissions/:id/settlement", authenticate("ADMIN"), async (req: AuthenticatedRequest, res) => {
    const id = Number(paramString(req.params.id));
    const raw = req.body?.reference;
    const reference = typeof raw === "string" ? raw.trim() : null;
    if (!Number.isInteger(id) || id < 1 || (reference !== null && reference.length > 120)) return res.status(400).json({ success: false, message: "Invalid commission ID or reference" });
    try { return res.json(await financeService.settleCommission(id, req.userId!, reference || null)); }
    catch (error) { if (error instanceof FinanceError) return res.status(409).json({ success: false, code: error.code, message: error.message }); console.error("Commission settlement failed", error); return res.status(500).json({ success: false, message: "Could not settle commission" }); }
});
export const financeRoute = router;
