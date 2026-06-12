import prisma from "../config/prisma.js";

/**
 * Sales Service — Database operations for sales management.
 * Controllers delegate all Prisma calls here.
 */

/**
 * Record a sale inside an atomic transaction.
 *
 * Uses a raw SQL UPDATE with a WHERE guard (`quantity > 0 AND userId = ?`)
 * so the database itself enforces stock availability and ownership in a
 * single atomic operation — eliminating TOCTOU race conditions that the
 * previous read-then-write approach was vulnerable to.
 */
export async function recordSale({ productId, soldById, soldPrice, customerName }) {
  return prisma.$transaction(async (tx) => {
    // ── Step 1: Atomic decrement ────────────────────────────────
    // This single UPDATE guarantees that:
    //   • The product exists and belongs to the requesting user
    //   • There is at least 1 unit in stock
    //   • The quantity is decremented AND status is recalculated
    //     in one round-trip — no race window.
    const rowsAffected = await tx.$executeRaw`
      UPDATE "Product"
      SET
        "quantity" = "quantity" - 1,
        "status" = CASE
          WHEN "quantity" - 1 = 0 THEN 'OUT_OF_STOCK'::"ProductStatus"
          WHEN "quantity" - 1 <= 3 THEN 'LOW_STOCK'::"ProductStatus"
          ELSE 'IN_STOCK'::"ProductStatus"
        END,
        "updatedAt" = NOW()
      WHERE "id" = ${productId}
        AND "userId" = ${soldById}
        AND "quantity" > 0
    `;

    // ── Step 2: Interpret the result ────────────────────────────
    // If 0 rows were updated, either the product doesn't exist,
    // doesn't belong to this user, or is already out of stock.
    if (rowsAffected === 0) {
      // Do a quick lookup to give a precise error message
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { id: true, userId: true, quantity: true },
      });

      if (!product || product.userId !== soldById) {
        throw Object.assign(new Error("Product not found."), { status: 404 });
      }
      // Product exists & belongs to user → must be out of stock
      throw Object.assign(
        new Error("Product is out of stock. Cannot sell."),
        { status: 400 }
      );
    }

    // ── Step 3: Create the sale record ──────────────────────────
    const sale = await tx.sale.create({
      data: {
        productId,
        soldById,
        soldPrice: parseFloat(soldPrice),
        customerName: customerName || null,
      },
      include: {
        product: {
          select: {
            id: true,
            brand: true,
            model: true,
            variant: true,
            storage: true,
            color: true,
          },
        },
        soldBy: {
          select: { id: true },
        },
      },
    });

    // ── Step 4: Read back updated product state ─────────────────
    const updatedProduct = await tx.product.findUnique({
      where: { id: productId },
      select: { quantity: true, status: true },
    });

    return {
      sale,
      newQuantity: updatedProduct.quantity,
      newStatus: updatedProduct.status,
    };
  });
}

/** List sales with filtering and pagination */
export async function listSales({ where, skip, take }) {
  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      orderBy: { soldDate: "desc" },
      skip,
      take,
      include: {
        product: {
          select: {
            id: true,
            brand: true,
            model: true,
            variant: true,
            storage: true,
            color: true,
            purchasePrice: true,
          },
        },
        soldBy: {
          select: { id: true },
        },
      },
    }),
    prisma.sale.count({ where }),
  ]);

  return { sales, total };
}

/** Get sales for stats calculation */
export async function getSalesForStats(where) {
  return prisma.sale.findMany({
    where,
    select: {
      soldPrice: true,
      product: {
        select: {
          brand: true,
          purchasePrice: true,
        },
      },
    },
  });
}

/** Find a single sale by ID */
export async function findSaleById(id) {
  return prisma.sale.findUnique({
    where: { id },
    include: {
      product: {
        select: {
          id: true,
          brand: true,
          model: true,
          variant: true,
          storage: true,
          ram: true,
          color: true,
          imei: true,
          purchasePrice: true,
        },
      },
      soldBy: {
        select: { id: true, name: true },
      },
    },
  });
}
