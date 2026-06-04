import prisma from "../config/prisma.js";

// ──────────────────────────────────────────
// GET /api/products — List all products
// ──────────────────────────────────────────
export async function getProducts(req, res, next) {
  try {
    const {
      search,
      brand,
      status,
      page = 1,
      limit = 20,
      sort = "createdAt",
      order = "desc",
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // Build filter conditions
    const where = {};

    if (search) {
      where.OR = [
        { brand: { contains: search, mode: "insensitive" } },
        { model: { contains: search, mode: "insensitive" } },
        { imei: { contains: search, mode: "insensitive" } },
        { color: { contains: search, mode: "insensitive" } },
      ];
    }

    if (brand) {
      where.brand = { equals: brand, mode: "insensitive" };
    }

    if (status) {
      where.status = status.toUpperCase();
    }

    // Build sort
    const orderBy = {};
    const validSortFields = [
      "createdAt",
      "brand",
      "model",
      "sellingPrice",
      "quantity",
    ];
    const sortField = validSortFields.includes(sort) ? sort : "createdAt";
    orderBy[sortField] = order === "asc" ? "asc" : "desc";

    // Execute query with count
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          supplier: {
            select: { id: true, supplierName: true },
          },
        },
      }),
      prisma.product.count({ where }),
    ]);

    res.json({
      products,
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
// GET /api/products/low-stock
// ──────────────────────────────────────────
export async function getLowStock(req, res, next) {
  try {
    const products = await prisma.product.findMany({
      where: {
        status: { in: ["LOW_STOCK", "OUT_OF_STOCK"] },
      },
      orderBy: { quantity: "asc" },
      include: {
        supplier: {
          select: { id: true, supplierName: true },
        },
      },
    });

    res.json({ products, count: products.length });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────
// GET /api/products/stats — Inventory summary
// ──────────────────────────────────────────
export async function getStats(req, res, next) {
  try {
    const [totalProducts, totalUnits, lowStockCount, inventoryValue] =
      await Promise.all([
        prisma.product.count(),
        prisma.product.aggregate({ _sum: { quantity: true } }),
        prisma.product.count({
          where: { status: { in: ["LOW_STOCK", "OUT_OF_STOCK"] } },
        }),
        prisma.product.findMany({
          select: { sellingPrice: true, quantity: true },
        }),
      ]);

    const totalValue = inventoryValue.reduce((sum, p) => {
      return sum + Number(p.sellingPrice) * p.quantity;
    }, 0);

    res.json({
      totalProducts,
      totalUnits: totalUnits._sum.quantity || 0,
      lowStockCount,
      totalValue,
    });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────
// GET /api/products/imei/:imei — Lookup by IMEI
// ──────────────────────────────────────────
export async function getByImei(req, res, next) {
  try {
    const product = await prisma.product.findUnique({
      where: { imei: req.params.imei },
      include: {
        supplier: {
          select: { id: true, supplierName: true },
        },
      },
    });

    if (!product) {
      return res
        .status(404)
        .json({ error: "No product found with this IMEI." });
    }

    res.json({ product });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────
// GET /api/products/:id — Get single product
// ──────────────────────────────────────────
export async function getProduct(req, res, next) {
  try {
    const product = await prisma.product.findUnique({
      where: { id: parseInt(req.params.id) },
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

    if (!product) {
      return res.status(404).json({ error: "Product not found." });
    }

    res.json({ product });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────
// POST /api/products — Create a new product
// ──────────────────────────────────────────
export async function createProduct(req, res, next) {
  try {
    const {
      brand,
      model,
      variant,
      storage,
      ram,
      color,
      imei,
      supplierId,
      purchasePrice,
      sellingPrice,
      quantity,
      imageUrl,
    } = req.body;

    if (!brand || !model || !purchasePrice || !sellingPrice) {
      return res.status(400).json({
        error: "Brand, model, purchasePrice, and sellingPrice are required.",
      });
    }

    // Auto stock status
    const qty = quantity || 0;
    let status = "IN_STOCK";
    if (qty === 0) status = "OUT_OF_STOCK";
    else if (qty <= 3) status = "LOW_STOCK";

    const product = await prisma.product.create({
      data: {
        brand,
        model,
        variant,
        storage,
        ram,
        color,
        imei,
        supplierId: supplierId ? parseInt(supplierId) : null,
        purchasePrice: parseFloat(purchasePrice),
        sellingPrice: parseFloat(sellingPrice),
        quantity: qty,
        imageUrl,
        status,
      },
      include: {
        supplier: {
          select: { id: true, supplierName: true },
        },
      },
    });

    res.status(201).json({ product });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────
// PUT /api/products/:id — Update a product
// ──────────────────────────────────────────
export async function updateProduct(req, res, next) {
  try {
    const {
      brand,
      model,
      variant,
      storage,
      ram,
      color,
      imei,
      supplierId,
      purchasePrice,
      sellingPrice,
      quantity,
      imageUrl,
    } = req.body;

    // Only update provided fields
    const data = {};
    if (brand !== undefined) data.brand = brand;
    if (model !== undefined) data.model = model;
    if (variant !== undefined) data.variant = variant;
    if (storage !== undefined) data.storage = storage;
    if (ram !== undefined) data.ram = ram;
    if (color !== undefined) data.color = color;
    if (imei !== undefined) data.imei = imei;
    if (supplierId !== undefined)
      data.supplierId = supplierId ? parseInt(supplierId) : null;
    if (purchasePrice !== undefined)
      data.purchasePrice = parseFloat(purchasePrice);
    if (sellingPrice !== undefined)
      data.sellingPrice = parseFloat(sellingPrice);
    if (imageUrl !== undefined) data.imageUrl = imageUrl;

    if (quantity !== undefined) {
      data.quantity = parseInt(quantity);
      if (data.quantity === 0) data.status = "OUT_OF_STOCK";
      else if (data.quantity <= 3) data.status = "LOW_STOCK";
      else data.status = "IN_STOCK";
    }

    const product = await prisma.product.update({
      where: { id: parseInt(req.params.id) },
      data,
      include: {
        supplier: {
          select: { id: true, supplierName: true },
        },
      },
    });

    res.json({ product });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────
// DELETE /api/products/:id — Delete a product
// ──────────────────────────────────────────
export async function deleteProduct(req, res, next) {
  try {
    const salesCount = await prisma.sale.count({
      where: { productId: parseInt(req.params.id) },
    });

    if (salesCount > 0) {
      return res.status(400).json({
        error: `Cannot delete: this product has ${salesCount} sale record(s). Consider setting quantity to 0 instead.`,
      });
    }

    await prisma.product.delete({
      where: { id: parseInt(req.params.id) },
    });

    res.json({ message: "Product deleted successfully." });
  } catch (err) {
    next(err);
  }
}
