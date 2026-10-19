import bcrypt from "bcryptjs";
import { db } from "../../prisma/db.js";
import { generateToken } from "../../utils/jwt.js";



interface RegisterUserInput {
    name: string;
    email: string;
    phone: string;
    password: string;
}

interface UpdateMyProfileInput {
    name?: string;
    phone?: string;
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


const getUserById = async (userId: number) => {
    const user = await db.orm.public.User
        .where({ id: userId })
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
        .first();

    if (!user) {
        throw new Error("USER_NOT_FOUND");
    }

    return {
        success: true,
        data: user,
    };
};

const getUserRoleById = async (userId: number) => {
    const user = await db.orm.public.User
        .where({ id: userId })
        .select("id", "role", "status")
        .first();

    if (!user) {
        throw new Error("USER_NOT_FOUND");
    }

    return {
        id: user.id,
        role: user.role,
        status: user.status,
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

    let user;

    try {
        user = await (db.orm.public.User as any).create({
            name,
            email,
            phone,
            passwordHash,
            createdAt: now,
            updatedAt: now,
        });
    } catch (error: unknown) {
        if (typeof error === "object" && error !== null) {
            const dbError = error as {
                sqlState?: string;
                constraint?: string;
            };

            if (dbError.sqlState === "23505") {
                const constraint = dbError.constraint?.toLowerCase() ?? "";

                if (constraint.includes("email")) {
                    throw new Error("EMAIL_ALREADY_EXISTS");
                }

                if (constraint.includes("phone")) {
                    throw new Error("PHONE_ALREADY_EXISTS");
                }
            }
        }

        // Preserve all unrelated database errors.
        throw error;
    }

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



interface LoginUserInput {
    email: string;
    password: string;
}

const loginUser = async (input: LoginUserInput) => {
    const email = input.email.trim().toLowerCase();

    // Find the user by email.
    const user = await db.orm.public.User
        .where({ email })
        .first();

    // Reject the login if the email does not exist.
    if (!user) {
        throw new Error("INVALID_CREDENTIALS");
    }

    // Reject login if the account is not active.
    if (user.status !== "ACTIVE") {
        throw new Error("ACCOUNT_NOT_ACTIVE");
    }

    // Compare the submitted password with the stored password hash.
    const isPasswordValid = await bcrypt.compare(
        input.password,
        user.passwordHash
    );

    if (!isPasswordValid) {
        throw new Error("INVALID_CREDENTIALS");
    }

    // Never return the password hash to the client.
    const {
        passwordHash: _passwordHash,
        ...safeUser
    } = user;

    const accessToken = generateToken(user.id);

    return {
        success: true,
        message: "Login successful",
        data: {
            user: safeUser,
            accessToken,
        },
    };
};


const updateMyProfile = async (
    userId: number,
    input: UpdateMyProfileInput
) => {
    // Check whether the user exists.
    const existingUser = await db.orm.public.User
        .where({ id: userId })
        .first();

    if (!existingUser) {
        throw new Error("USER_NOT_FOUND");
    }

    // Check whether the phone number is already registered.
    if (input.phone !== undefined) {
        const existingPhone = await db.orm.public.User
            .where({ phone: input.phone })
            .first();

        if (existingPhone && existingPhone.id !== userId) {
            throw new Error("PHONE_ALREADY_EXISTS");
        }
    }

    // Prepare only the fields that can be updated.
    const updateData = {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.phone !== undefined && { phone: input.phone }),
    };

    // Update only the authenticated user's record.
    const updatedUser = await db.orm.public.User
        .where({ id: userId })
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
        .update(updateData);

    if (!updatedUser) {
        throw new Error("USER_NOT_FOUND");
    }

    return {
        success: true,
        message: "Profile updated successfully",
        data: updatedUser,
    };
};

export const userService = {
    getUser,
    registerUser,
    loginUser,
    getUserById,
    getUserRoleById,
    updateMyProfile,
};