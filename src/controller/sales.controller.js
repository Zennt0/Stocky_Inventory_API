import * as salesService from "../services/sales.service.js";

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

    const result = await salesService.recordSale({
      productId: pid,
      soldById: req.user.id,
      soldPrice,
      customerName,
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
    const where = { soldById: req.user.id };
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

    const { sales, total } = await salesService.listSales({ where, skip, take });

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
    const where = { soldById: req.user.id };
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

    const sales = await salesService.getSalesForStats(where) || [];

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

    const sale = await salesService.findSaleById(id);

    if (!sale || sale.soldById !== req.user.id) {
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
