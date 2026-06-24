import prisma from "../config/prisma.js";

/**
 * Chat Service — Database operations for chat/AI features.
 * Controllers delegate all Prisma calls here.
 */

/** Get chat message history for a user */
export async function getChatHistory(userId) {
  return prisma.chatMessage.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
}

/** Get recent chat history (descending, limited) for AI context */
export async function getRecentHistory(userId, limit = 15) {
  return prisma.chatMessage.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** Save a user message and AI reply as a transaction */
export async function saveChatExchange(userId, userMessage, aiReply, containsWarning) {
  return prisma.$transaction([
    prisma.chatMessage.create({
      data: { text: userMessage, isUser: true, userId },
    }),
    prisma.chatMessage.create({
      data: {
        text: aiReply,
        isUser: false,
        isAlert: containsWarning,
        isHappy: !containsWarning,
        userId,
      },
    }),
  ]);
}

/** Get inventory data context for AI (products, sales, low stock) */
export async function getInventoryContext(userId) {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const weekAgo = new Date(todayStart);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [productStats, lowStockProducts, allProducts, salesStats, recentSales] =
    await Promise.all([
      // Product overview stats
      (async () => {
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

        const totalValue = Number(valuationResult[0]?.totalValue ?? 0);

        return { totalProducts, totalUnits: totalUnits._sum.quantity || 0, lowStockCount, totalValue };
      })(),

      // Low stock products
      prisma.product.findMany({
        where: { status: { in: ["LOW_STOCK", "OUT_OF_STOCK"] }, userId },
        orderBy: { quantity: "asc" },
        select: {
          brand: true,
          model: true,
          variant: true,
          color: true,
          quantity: true,
          status: true,
          sellingPrice: true,
        },
      }),

      // All products summary
      prisma.product.findMany({
        where: { userId },
        orderBy: { brand: "asc" },
        select: {
          brand: true,
          model: true,
          variant: true,
          storage: true,
          color: true,
          quantity: true,
          sellingPrice: true,
          purchasePrice: true,
          status: true,
        },
      }),

      // Today's sales stats
      (async () => {
        const sales = await prisma.sale.findMany({
          where: { soldDate: { gte: todayStart }, soldById: userId },
          select: {
            soldPrice: true,
            product: {
              select: { brand: true, model: true },
            },
          },
        });

        const totalSales = sales.length;
        const totalRevenue = sales.reduce(
          (sum, s) => sum + Number(s.soldPrice),
          0
        );

        return { totalSales, totalRevenue };
      })(),

      // Recent sales (last 7 days)
      prisma.sale.findMany({
        where: { soldDate: { gte: weekAgo }, soldById: userId },
        orderBy: { soldDate: "desc" },
        take: 50,
        include: {
          product: {
            select: { brand: true, model: true, variant: true, color: true, storage: true, purchasePrice: true },
          },
          soldBy: {
            select: { id: true },
          },
        },
      }),
    ]);

  return { productStats, lowStockProducts, allProducts, salesStats, recentSales };
}

/** Get lightweight stats context for non-inventory intents (specs, general chat) */
export async function getMinimalContext(userId) {
  const [totalProducts, totalUnits, lowStockCount] = await Promise.all([
    prisma.product.count({ where: { userId } }),
    prisma.product.aggregate({
      where: { userId },
      _sum: { quantity: true },
    }),
    prisma.product.count({
      where: { status: { in: ["LOW_STOCK", "OUT_OF_STOCK"] }, userId },
    }),
  ]);

  return {
    totalProducts,
    totalUnits: totalUnits._sum.quantity || 0,
    lowStockCount,
  };
}
