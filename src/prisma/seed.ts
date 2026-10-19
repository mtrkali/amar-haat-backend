// Loads the sample catalog into the database.
// Run once with:  npm run seed
// It is safe to run again: rows that already exist (same slug) are skipped.
import { db } from "./db.js";

const categories = [
    {
        "slug": "vegetables-fruits",
        "name": "সবজি ও ফল",
        "imageUrl": "/images/categories/vegetables-fruits.webp",
        "sortOrder": 0
    },
    {
        "slug": "food",
        "name": "খাদ্য পণ্য",
        "imageUrl": "/images/categories/food.webp",
        "sortOrder": 1
    },
    {
        "slug": "clothing",
        "name": "পোশাক",
        "imageUrl": "/images/categories/clothing.webp",
        "sortOrder": 2
    },
    {
        "slug": "electronics",
        "name": "ইলেকট্রনিক্স",
        "imageUrl": "/images/categories/electronics.webp",
        "sortOrder": 3
    },
    {
        "slug": "household",
        "name": "গৃহস্থালি পণ্য",
        "imageUrl": "/images/categories/household.webp",
        "sortOrder": 4
    },
    {
        "slug": "beauty",
        "name": "বিউটি ও কেয়ার",
        "imageUrl": "/images/categories/beauty.webp",
        "sortOrder": 5
    },
    {
        "slug": "agriculture",
        "name": "কৃষি পণ্য",
        "imageUrl": "/images/categories/agriculture.webp",
        "sortOrder": 6
    }
];

const faqs = [
    {
        "question": "কিভাবে অর্ডার করবো?",
        "answer": "পছন্দের পণ্য কার্টে যোগ করুন, ডেলিভারির ঠিকানা দিন এবং অর্ডার নিশ্চিত করুন। লগইন ছাড়াও অতিথি হিসেবে অর্ডার করা যাবে।",
        "sortOrder": 0
    },
    {
        "question": "ডেলিভারি কতদিনে হবে?",
        "answer": "ফেনী এরিয়ায় দ্রুত ডেলিভারি দেওয়া হয়। পণ্য ও এলাকা অনুযায়ী সময় আলাদা হতে পারে।",
        "sortOrder": 1
    },
    {
        "question": "পেমেন্ট পদ্ধতি কি কি?",
        "answer": "ক্যাশ অন ডেলিভারি (COD) সুবিধা আছে, অর্থাৎ পণ্য হাতে পেয়ে টাকা দিতে পারবেন।",
        "sortOrder": 2
    },
    {
        "question": "রিটার্ন বা এক্সচেঞ্জ করা যাবে?",
        "answer": "রিটার্ন ও এক্সচেঞ্জের নিয়ম পণ্যভেদে আলাদা। বিস্তারিত জানতে রিটার্ন নীতি দেখুন।",
        "sortOrder": 3
    }
];

// Stock levels are placeholders. Set the real numbers from the admin side later.
const DEFAULT_STOCK = 50;

const products = [
    {
        "slug": "tomato",
        "name": "টমেটো (দেশি)",
        "categorySlug": "vegetables-fruits",
        "price": 80,
        "oldPrice": 91,
        "imageUrl": "/images/products/tomato.webp"
    },
    {
        "slug": "basmati-rice",
        "name": "বাসমতি চাল (৫ কেজি)",
        "categorySlug": "food",
        "price": 350,
        "oldPrice": null,
        "imageUrl": "/images/products/basmati-rice.webp"
    },
    {
        "slug": "cotton-shirt",
        "name": "কটন শার্ট (মেন)",
        "categorySlug": "clothing",
        "price": 550,
        "oldPrice": null,
        "imageUrl": "/images/products/cotton-shirt.webp"
    },
    {
        "slug": "mustard-oil",
        "name": "সরিষার তেল (১ লিটার)",
        "categorySlug": "food",
        "price": 210,
        "oldPrice": null,
        "imageUrl": "/images/products/mustard-oil.webp"
    },
    {
        "slug": "eggs",
        "name": "দেশি ডিম (১২ পিস)",
        "categorySlug": "food",
        "price": 160,
        "oldPrice": null,
        "imageUrl": "/images/products/eggs.webp"
    },
    {
        "slug": "potato",
        "name": "আলু (দেশি, ১ কেজি)",
        "categorySlug": "vegetables-fruits",
        "price": 45,
        "oldPrice": null,
        "imageUrl": null
    },
    {
        "slug": "banana",
        "name": "সাগর কলা (১ ডজন)",
        "categorySlug": "vegetables-fruits",
        "price": 90,
        "oldPrice": 100,
        "imageUrl": null
    },
    {
        "slug": "lentils",
        "name": "মসুর ডাল (১ কেজি)",
        "categorySlug": "food",
        "price": 140,
        "oldPrice": null,
        "imageUrl": null
    },
    {
        "slug": "panjabi",
        "name": "কটন পাঞ্জাবি",
        "categorySlug": "clothing",
        "price": 950,
        "oldPrice": 1100,
        "imageUrl": null
    },
    {
        "slug": "earbuds",
        "name": "ওয়্যারলেস ইয়ারবাড",
        "categorySlug": "electronics",
        "price": 990,
        "oldPrice": null,
        "imageUrl": null
    },
    {
        "slug": "power-bank",
        "name": "পাওয়ার ব্যাংক (১০০০০ mAh)",
        "categorySlug": "electronics",
        "price": 1250,
        "oldPrice": null,
        "imageUrl": null
    },
    {
        "slug": "detergent",
        "name": "ডিটারজেন্ট পাউডার (১ কেজি)",
        "categorySlug": "household",
        "price": 120,
        "oldPrice": null,
        "imageUrl": null
    },
    {
        "slug": "face-cream",
        "name": "ফেস ক্রিম (৫০ গ্রাম)",
        "categorySlug": "beauty",
        "price": 180,
        "oldPrice": 200,
        "imageUrl": null
    },
    {
        "slug": "vegetable-seeds",
        "name": "সবজির বীজ (প্যাকেট)",
        "categorySlug": "agriculture",
        "price": 30,
        "oldPrice": null,
        "imageUrl": null
    },
    {
        "slug": "organic-fertilizer",
        "name": "জৈব সার (৫ কেজি)",
        "categorySlug": "agriculture",
        "price": 250,
        "oldPrice": null,
        "imageUrl": null
    }
];

const seed = async () => {
    await db.connect();

    const categoryIdBySlug = new Map<string, number>();

    for (const category of categories) {
        let row = await db.orm.public.Category.where({ slug: category.slug }).first();

        if (!row) {
            row = await (db.orm.public.Category as any).create({
                slug: category.slug,
                name: category.name,
                imageUrl: category.imageUrl,
                sortOrder: category.sortOrder,
            });
            console.log("Created category:", category.slug);
        }

        if (!row) {
            throw new Error(`Failed to create category: ${category.slug}`);
        }

        categoryIdBySlug.set(category.slug, row.id);
    }

    for (const product of products) {
        const exists = await db.orm.public.Product.where({ slug: product.slug }).first();

        if (exists) continue;

        const categoryId = categoryIdBySlug.get(product.categorySlug);

        if (categoryId === undefined) {
            throw new Error(`Unknown category for product ${product.slug}`);
        }

        const now = new Date().toISOString();

        await (db.orm.public.Product as any).create({
            slug: product.slug,
            name: product.name,
            categoryId,
            price: product.price,
            oldPrice: product.oldPrice,
            stock: DEFAULT_STOCK,
            imageUrl: product.imageUrl,
            createdAt: now,
            updatedAt: now,
        });
        console.log("Created product:", product.slug);
    }

    for (const faq of faqs) {
        const exists = await db.orm.public.Faq.where({ question: faq.question }).first();

        if (exists) continue;

        await (db.orm.public.Faq as any).create({ ...faq, isActive: true });
        console.log("Created FAQ:", faq.question);
    }

    // Testimonials are not seeded on purpose: the frontend ones are placeholders,
    // and fake customer reviews should not go live. Add real ones with POST /testimonials.

    console.log("Seed finished.");
};

try {
    await seed();
} catch (error) {
    console.error("Seed failed:", error);
    process.exitCode = 1;
} finally {
    await db.close();
}