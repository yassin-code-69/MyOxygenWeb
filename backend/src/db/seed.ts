import { db } from "./client";
import { categories, products, productBatches, users } from "./schema/tables";
import * as bcrypt from "bcryptjs";

export async function seed() {
  console.log("🌱 Seeding database...");

  // 1. Seed Core Categories
  const categoryData = [
    { name: "Newborn", slug: "newborn", iconUrl: "/icons/newborn.svg" },
    {
      name: "Mother Care",
      slug: "mother-care",
      iconUrl: "/icons/mother-care.svg",
    },
    { name: "Skin Care", slug: "skin-care", iconUrl: "/icons/skin-care.svg" },
    {
      name: "Inner Wear",
      slug: "inner-wear",
      iconUrl: "/icons/inner-wear.svg",
    },
  ];

  const insertedCategories = await db
    .insert(categories)
    .values(categoryData)
    .onConflictDoNothing()
    .returning();

  const allCategories = await db.query.categories.findMany();

  // 2. Seed Super Admin
  const adminPasswordHash = await bcrypt.hash("Admin@MyOxygen2026", 10);
  await db
    .insert(users)
    .values({
      fullName: "System Super Admin",
      email: "admin@myoxygen.com",
      phone: "+8801700000000",
      passwordHash: adminPasswordHash,
      role: "SUPER_ADMIN",
    })
    .onConflictDoNothing();

  // 3. Seed Perishable Skincare Product with Batches
  const skinCareCat = allCategories.find((c) => c.slug === "skin-care")!;
  if (skinCareCat) {
    const existingProduct = await db.query.products.findFirst({
      where: (p, { eq }) => eq(p.sku, "SKN-FW-001"),
    });

    let skinCareProductId = existingProduct?.id;

    if (!existingProduct) {
      const [newProd] = await db
        .insert(products)
        .values({
          categoryId: skinCareCat.id,
          title: "Natural Hydrating Face Wash",
          slug: "natural-hydrating-face-wash",
          sku: "SKN-FW-001",
          description:
            "Gentle dermatologically tested organic face cleanser for mothers.",
          basePrice: "650.00",
          costPrice: "420.00",
          images: [
            "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800",
          ],
          requiresBatchTracking: true,
          lowStockThreshold: 10,
        })
        .returning();
      skinCareProductId = newProd.id;
    }

    if (skinCareProductId) {
      // Add 2 Batches (FEFO Test Setup)
      await db
        .insert(productBatches)
        .values([
          {
            productId: skinCareProductId,
            batchNumber: "BATCH-2026-A",
            manufactureDate: "2026-01-10",
            expiryDate: "2026-08-30", // Expires earlier
            initialQuantity: 50,
            availableQuantity: 50,
          },
          {
            productId: skinCareProductId,
            batchNumber: "BATCH-2026-B",
            manufactureDate: "2026-02-15",
            expiryDate: "2027-02-15", // Expires later
            initialQuantity: 100,
            availableQuantity: 100,
          },
        ])
        .onConflictDoNothing();
    }
  }

  // 4. Also seed Featured Products from Mockup
  const newbornCat = allCategories.find((c) => c.slug === "newborn");
  if (newbornCat) {
    await db
      .insert(products)
      .values({
        categoryId: newbornCat.id,
        title: "Ultra Soft Baby Diaper (Pants)",
        slug: "ultra-soft-baby-diaper",
        sku: "NWB-DP-001",
        description: "Breathable feather-soft diaper pants with wetness indicator for newborn comfort.",
        basePrice: "850.00",
        costPrice: "580.00",
        images: [
          "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=800",
        ],
        requiresBatchTracking: false,
        lowStockThreshold: 15,
      })
      .onConflictDoNothing();
  }

  const motherCat = allCategories.find((c) => c.slug === "mother-care");
  if (motherCat) {
    await db
      .insert(products)
      .values({
        categoryId: motherCat.id,
        title: "Complete Pregnancy Multivitamin",
        slug: "complete-pregnancy-multivitamin",
        sku: "MTR-VT-001",
        description: "Essential prenatal folic acid, iron, and DHA supplement for maternal health.",
        basePrice: "1250.00",
        costPrice: "850.00",
        images: [
          "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=800",
        ],
        requiresBatchTracking: true,
        lowStockThreshold: 10,
      })
      .onConflictDoNothing();
  }

  const innerCat = allCategories.find((c) => c.slug === "inner-wear");
  if (innerCat) {
    await db
      .insert(products)
      .values({
        categoryId: innerCat.id,
        title: "Seamless Comfort Nursing Bra",
        slug: "seamless-comfort-nursing-bra",
        sku: "INW-BR-001",
        description: "Soft stretch breathable wire-free support bra designed for daily nursing ease.",
        basePrice: "1100.00",
        costPrice: "720.00",
        images: [
          "https://images.unsplash.com/photo-1596704017254-9b121068fb31?w=800",
        ],
        requiresBatchTracking: false,
        lowStockThreshold: 8,
      })
      .onConflictDoNothing();
  }

  console.log("✅ Seeding completed successfully.");
}

if (import.meta.main || process.argv[1]?.includes("seed.ts")) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("❌ Seeding failed:", err);
      process.exit(1);
    });
}
