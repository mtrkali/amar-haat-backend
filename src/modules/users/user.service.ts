import bcrypt from "bcryptjs";
import { db } from "../../prisma/db.js";

interface RegisterUserInput {
    name: string;
    email: string;
    phone: string;
    password: string;
}

const getUser = async () => {
    const users = await db.orm.public.User
        .select(
            "id",
            "name",
            "email",
            "phone",
            "role",
            "status",
            "emailVerified",
            "phoneVerified",
            "createdAt",
            "updatedAt"
        )
        .all();

    return {
        success: true,
        data: users,
    };
};

const registerUser = async (input: RegisterUserInput) => {
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    const phone = input.phone.trim();

    // Check whether the email already exists.
    const existingEmail = await db.orm.public.User
        .where({ email })
        .first();

    if (existingEmail) {
        throw new Error("EMAIL_ALREADY_EXISTS");
    }

    // Check whether the phone number already exists.
    const existingPhone = await db.orm.public.User
        .where({ phone })
        .first();

    if (existingPhone) {
        throw new Error("PHONE_ALREADY_EXISTS");
    }

    // Hash the password before storing it.
    const passwordHash = await bcrypt.hash(input.password, 12);

    // Create the user in PostgreSQL.
    const now = new Date().toISOString();
    const user = await (db.orm.public.User as any).create({
        name,
        email,
        phone,
        passwordHash,
        createdAt: now,
        updatedAt: now,
    });

    // Never return the password hash to the client.
    const {
        passwordHash: _passwordHash,
        ...safeUser
    } = user;

    return {
        success: true,
        message: "Registration successful",
        data: safeUser,
    };
};

export const userService = {
    getUser,
    registerUser,
};