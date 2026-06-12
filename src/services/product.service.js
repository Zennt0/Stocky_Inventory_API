import prisma from "../config/prisma.js";

/**
 * Product Service — Database operations for product management.
 * Controllers delegate all Prisma calls here.
 */

/** List products with filtering, pagination, and sorting */
export async function listProducts(userId, { where, orderBy, skip, take }) {
  const filter = { ...where, userId };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where: filter,
      orderBy,
      skip,
      take,
      include: {
        supplier: {
          select: { id: true, supplierName: true },
        },
      },
    }),
    prisma.product.count({ where: filter }),
  ]);

  return { products, total };
}

/** Get low stock and out-of-stock products */
export async function getLowStockProducts(userId) {
  return prisma.product.findMany({
    where: {
      status: { in: ["LOW_STOCK", "OUT_OF_STOCK"] },
      userId,
    },
    orderBy: { quantity: "asc" },
    include: {
      supplier: {
        select: { id: true, supplierName: true },
      },
    },
  });
}

/** Get inventory summary stats (count, units, low-stock, total value) */
export async function getInventoryStats(userId) {
  const [totalProducts, totalUnits, lowStockCount, valuationResult] =
    await Promise.all([
      prisma.product.count({ where: { userId } }),
      prisma.product.aggregate({
        where: { userId },
        _sum: { quantity: true },
      }),
      prisma.product.count({
        where: { status: { in: ["LOW_STOCK", "OUT_OF_STOCK"] }, userId },
      }),
      prisma.$queryRaw`SELECT COALESCE(SUM("sellingPrice" * "quantity"), 0) as "totalValue" FROM "Product" WHERE "userId" = ${userId}`,
    ]);

  return {
    totalProducts,
    totalUnits: totalUnits._sum.quantity || 0,
    lowStockCount,
    totalValue: Number(valuationResult[0]?.totalValue ?? 0),
  };
}

/** Find a product by IMEI */
export async function findByImei(imei) {
  return prisma.product.findUnique({
    where: { imei },
    include: {
      supplier: {
        select: { id: true, supplierName: true },
      },
    },
  });
}

/** Find a product by ID (with recent sales) */
export async function findById(id) {
  return prisma.product.findUnique({
    where: { id },
    include: {
      supplier: {
        select: { id: true, supplierName: true },
      },
      sales: {
        orderBy: { soldDate: "desc" },
        take: 5,
        select: {
          id: true,
          soldPrice: true,
          customerName: true,
          soldDate: true,
          soldBy: { select: { name: true } },
        },
      },
    },
  });
}

/** Compute product stock status from quantity */
export function computeStatus(quantity) {
  if (quantity === 0) return "OUT_OF_STOCK";
  if (quantity <= 3) return "LOW_STOCK";
  return "IN_STOCK";
}

/** Create a new product */
export async function createProduct(data) {
  return prisma.product.create({
    data,
    include: {
      supplier: {
        select: { id: true, supplierName: true },
      },
    },
  });
}

/** Find a product by ID (lightweight — no relations) */
export async function findByIdLean(id) {
  return prisma.product.findUnique({ where: { id } });
}

/** Update a product */
export async function updateProduct(id, data) {
  return prisma.product.update({
    where: { id },
    data,
    include: {
      supplier: {
        select: { id: true, supplierName: true },
      },
    },
  });
}

/** Count sales for a product */
export async function countSalesForProduct(productId) {
  return prisma.sale.count({ where: { productId } });
}

/** Delete a product */
export async function deleteProduct(id) {
  return prisma.product.delete({ where: { id } });
}
