import { db } from "../src/prisma/db.js";
import { sellerService } from "../src/modules/sellers/seller.service.js";
import { timestamp } from "../src/utils/http.js";

const action = process.argv[2];
const email = process.argv[3]?.trim().toLowerCase();
let connected = false;

async function main() {
    if (!email || !email.includes("@")) {
        throw new Error("Usage: npm run admin:promote -- user@example.com OR npm run seller:approve -- seller@example.com");
    }

    await db.connect();
    connected = true;

    if (action === "promote-admin") {
        const user = await db.orm.public.User.where({ email })
            .select("id", "name", "email", "role", "status")
            .first();
        if (!user) throw new Error(`No account found for ${email}. Sign up first, then run this command.`);
        if (user.status !== "ACTIVE") throw new Error(`Account ${email} is not active.`);
        if (user.role === "ADMIN") {
            console.log(`${email} is already an ADMIN.`);
            return;
        }
        await db.orm.public.User.where({ id: user.id }).select("id").update({
            role: "ADMIN",
            updatedAt: timestamp(),
        });
        console.log(`Promoted ${user.name} (${email}) to ADMIN.`);
        console.log("Log out and log in again so the app refreshes the account role.");
        return;
    }

    if (action === "approve-seller") {
        const user = await db.orm.public.User.where({ email })
            .select("id", "name", "email")
            .first();
        if (!user) throw new Error(`No account found for ${email}.`);
        const seller = await db.orm.public.Seller.where({ userId: user.id })
            .select("id", "shopName", "status")
            .first();
        if (!seller) throw new Error(`${email} has not submitted a seller application yet.`);
        const result = await sellerService.updateSellerStatus(seller.id, "APPROVED");
        console.log(`Approved shop "${result.data.shopName}" for ${user.name} (${email}).`);
        console.log("Log out and log in again in that seller account, then open /seller/dashboard.");
        return;
    }

    throw new Error("Unknown action. Use admin:promote or seller:approve.");
}

try {
    await main();
} catch (error) {
    console.error(error instanceof Error ? error.message : "Command failed");
    process.exitCode = 1;
} finally {
    if (connected) await db.close();
}
