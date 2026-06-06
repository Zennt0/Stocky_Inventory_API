import prisma from "../config/prisma.js";

/** Safely parse an ID param — returns null if not a valid integer */
function parseId(val) {
  const n = parseInt(val, 10);
  return Number.isNaN(n) || n <= 0 ? null : n;
}

// ──────────────────────────────────────────
// POST /api/sales — Record a sale
// ──────────────────────────────────────────
export async function createSale(req, res, next) {
  try {
    const { productId, soldPrice, customerName } = req.body;

    if (!productId || !soldPrice) {
      return res
        .status(400)
        .json({ error: "productId and soldPrice are required." });
    }

    const pid = parseId(productId);
    if (!pid) return res.status(400).json({ error: "Invalid product ID." });

    // Atomic transaction: check stock + create sale + decrement in one go
    const result = await prisma.$transaction(async (tx) => {
      // Re-read product inside the transaction to prevent race conditions
      const product = await tx.product.findUnique({
        where: { id: pid },
      });

      if (!product) {
        throw Object.assign(new Error("Product not found."), { status: 404 });
      }

      if (product.quantity <= 0) {
        throw Object.assign(new Error("Product is out of stock. Cannot sell."), { status: 400 });
      }

      // Create sale record
      const sale = await tx.sale.create({
        data: {
          productId: pid,
          soldById: req.user.id,
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
            select: { id: true, name: true },
          },
        },
      });

      // Decrease quantity and update status
      const newQuantity = product.quantity - 1;
      let newStatus = "IN_STOCK";
      if (newQuantity === 0) newStatus = "OUT_OF_STOCK";
      else if (newQuantity <= 3) newStatus = "LOW_STOCK";

      await tx.product.update({
        where: { id: pid },
        data: {
          quantity: newQuantity,
          status: newStatus,
        },
      });

      return { sale, newQuantity, newStatus };
    });

    res.status(201).json({
      sale: result.sale,
      stockUpdate: {
        remainingQuantity: result.newQuantity,
        status: result.newStatus,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────
// GET /api/sales — List sales history
// ──────────────────────────────────────────
export async function getSales(req, res, next) {
  try {
    const { from, to, period, page = 1, limit = 20 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Build date filter
    const where = {};
    const now = new Date();

    if (period) {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      switch (period) {
        case "today":
          where.soldDate = { gte: today };
          break;
        case "week": {
          const weekAgo = new Date(today);
          weekAgo.setDate(weekAgo.getDate() - 7);
          where.soldDate = { gte: weekAgo };
          break;
        }
        case "month": {
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          where.soldDate = { gte: monthStart };
          break;
        }
      }
    } else {
      if (from) where.soldDate = { ...where.soldDate, gte: new Date(from) };
      if (to) where.soldDate = { ...where.soldDate, lte: new Date(to) };
    }

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
            select: { id: true, name: true },
          },
        },
      }),
      prisma.sale.count({ where }),
    ]);

    res.json({
      sales,
      pagination: {
        page: parseInt(page),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────
// GET /api/sales/stats — Sales analytics
// ──────────────────────────────────────────
export async function getSalesStats(req, res, next) {
  try {
    const { period } = req.query;
    const now = new Date();

    // Build date filter
    const where = {};
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (period) {
      case "today":
        where.soldDate = { gte: today };
        break;
      case "week": {
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        where.soldDate = { gte: weekAgo };
        break;
      }
      case "month": {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        where.soldDate = { gte: monthStart };
        break;
      }
      default:
        // all time
        break;
    }

    // Get all matching sales with product purchase price
    const sales = await prisma.sale.findMany({
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

    // Calculate stats
    const totalSales = sales.length;
    const totalRevenue = sales.reduce(
      (sum, s) => sum + Number(s.soldPrice),
      0
    );
    const totalProfit = sales.reduce((sum, s) => {
      return sum + (Number(s.soldPrice) - Number(s.product.purchasePrice));
    }, 0);

    // Top brands
    const brandCounts = {};
    sales.forEach((s) => {
      const brand = s.product.brand;
      brandCounts[brand] = (brandCounts[brand] || 0) + 1;
    });

    const topBrands = Object.entries(brandCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([brand, count]) => ({ brand, count }));

    res.json({
      totalSales,
      totalRevenue,
      totalProfit,
      averagePrice: totalSales > 0 ? totalRevenue / totalSales : 0,
      topBrands,
    });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────
// GET /api/sales/:id — Get single sale detail
// ──────────────────────────────────────────
export async function getSale(req, res, next) {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid sale ID." });

    const sale = await prisma.sale.findUnique({
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

    if (!sale) {
      return res.status(404).json({ error: "Sale not found." });
    }

    // Calculate profit for this sale
    const profit =
      Number(sale.soldPrice) - Number(sale.product.purchasePrice);

    res.json({ sale, profit });
  } catch (err) {
    next(err);
  }
}
