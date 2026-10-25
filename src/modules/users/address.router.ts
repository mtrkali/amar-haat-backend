import express from "express";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.middleware.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import { addressService, type AddressInput } from "./address.service.js";

const router = express.Router();
const parseAddress = (body: any): AddressInput | null => {
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
    const upazila = typeof body?.upazila === "string" ? body.upazila.trim() : "";
    const union = typeof body?.union === "string" ? body.union.trim() : "";
    const address = typeof body?.address === "string" ? body.address.trim() : "";
    const ward = body?.ward === null || body?.ward === "" || body?.ward === undefined ? null : Number(body.ward);
    if (name.length < 2 || name.length > 80 || !/^01[3-9]\d{8}$/.test(phone) || !upazila || !union || !address || address.length > 500 || (ward !== null && (!Number.isInteger(ward) || ward < 1 || ward > 99))) return null;
    return { name, phone, upazila, union, address, ward, label: typeof body.label === "string" ? body.label.trim().slice(0, 40) || null : null, note: typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null, isDefault: body.isDefault === true };
};
const run = async (req: AuthenticatedRequest, res: Response, action: () => Promise<unknown>) => {
    if (typeof req.userId !== "number") return res.status(401).json({ success: false, message: "Authentication required" });
    try { return res.json(await action()); }
    catch (error) {
        if (error instanceof Error && error.message === "ADDRESS_NOT_FOUND") return res.status(404).json({ success: false, message: "Address not found" });
        console.error("Address operation failed", error);
        return res.status(500).json({ success: false, message: "Address operation failed" });
    }
};
router.use(authenticate());
router.get("/", (req, res) => { const userId = (req as AuthenticatedRequest).userId!; return run(req as AuthenticatedRequest, res, () => addressService.list(userId)); });
router.post("/", (req, res) => {
    const input = parseAddress(req.body);
    if (!input) return res.status(400).json({ success: false, message: "Check the address fields" });
    const userId = (req as AuthenticatedRequest).userId!;
    return run(req as AuthenticatedRequest, res, () => addressService.save(userId, input));
});
router.put("/:id", (req, res) => {
    const id = Number(req.params["id"]); const input = parseAddress(req.body);
    if (!Number.isInteger(id) || id < 1 || !input) return res.status(400).json({ success: false, message: "Check the address fields" });
    const userId = (req as AuthenticatedRequest).userId!;
    return run(req as AuthenticatedRequest, res, () => addressService.save(userId, input, id));
});
router.patch("/:id/default", (req, res) => {
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, message: "Invalid address id" });
    const userId = (req as AuthenticatedRequest).userId!;
    return run(req as AuthenticatedRequest, res, () => addressService.setDefault(userId, id));
});
router.delete("/:id", (req, res) => {
    const id = Number(req.params["id"]);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, message: "Invalid address id" });
    const userId = (req as AuthenticatedRequest).userId!;
    return run(req as AuthenticatedRequest, res, () => addressService.remove(userId, id));
});
export const addressRoute = router;
