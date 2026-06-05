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

// ──────────────────────────────────────────
// GET /api/products/lookup-specs/:imei — AI Specs Lookup
// ──────────────────────────────────────────
export async function lookupSpecs(req, res, next) {
  try {
    const { imei } = req.params;

    console.log(`[IMEI Lookup] Received IMEI: "${imei}" (length: ${imei?.length})`);

    if (!imei || imei.length !== 15) {
      console.log(`[IMEI Lookup] REJECTED: Invalid IMEI length. Expected 15, got ${imei?.length}`);
      return res.status(400).json({ error: "A valid 15-digit IMEI is required." });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "SAMPLE") {
      console.log(`[IMEI Lookup] REJECTED: GEMINI_API_KEY not configured (value: "${apiKey}")`);
      return res.status(500).json({
        error: "Gemini API key is not configured. Please set GEMINI_API_KEY in your .env file.",
      });
    }

    const tac = imei.substring(0, 8);

    const systemPrompt = `You are an expert mobile device identification system. You MUST use Google Search to look up the TAC (Type Allocation Code) to identify the exact device.

Search for: "TAC ${tac}" or "IMEI ${tac} device" to find the brand and model.

You MUST respond ONLY with a valid JSON object (no markdown, no backticks, no explanation):
{
  "brand": "Manufacturer (e.g. Samsung, Apple, Oppo, Xiaomi)",
  "model": "Model name (e.g. Galaxy A25, iPhone 15 Pro)",
  "variant": "variant if known (e.g. 5G, LTE) or null",
  "storage": "storage if known (e.g. 128GB) or null",
  "ram": "RAM in GB number only (e.g. 8) or null",
  "color": "color if known or null"
}`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;

    const geminiBody = {
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: `Look up TAC: ${tac} (full IMEI: ${imei}). Search online and return the device brand and model as JSON.` }],
        },
      ],
      tools: [
        { google_search: {} },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
        thinkingConfig: {
          thinkingLevel: "MINIMAL",
        },
      },
    };

    // Fetch with retry for rate limiting (429)
    const MAX_RETRIES = 2;
    let geminiRes;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      geminiRes = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
      });

      console.log(`[IMEI Lookup] Gemini API status: ${geminiRes.status} (attempt ${attempt + 1})`);

      if (geminiRes.status === 429 && attempt < MAX_RETRIES) {
        const waitMs = (attempt + 1) * 3000; // 3s, 6s
        console.log(`[IMEI Lookup] Rate limited. Retrying in ${waitMs / 1000}s...`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      break;
    }

    if (geminiRes.status === 429) {
      return res.status(429).json({
        error: "AI lookup is temporarily unavailable due to limits. Please try again in a minute.",
      });
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => "");
      console.error("Gemini API error in lookup:", geminiRes.status, errText);
      return res.status(502).json({ error: `Failed to query AI for specifications: ${geminiRes.status}` });
    }

    const geminiData = await geminiRes.json();
    console.log(`[IMEI Lookup] Full Gemini response structure:`, JSON.stringify(geminiData, null, 2));

    const textReply = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    console.log(`[IMEI Lookup] Raw textReply: "${textReply}"`);

    if (!textReply) {
      // Check if there's a prompt feedback / block reason
      const blockReason = geminiData?.promptFeedback?.blockReason;
      if (blockReason) {
        console.log(`[IMEI Lookup] Blocked by Gemini: ${blockReason}`);
        return res.status(502).json({ error: `AI request was blocked: ${blockReason}` });
      }
      return res.status(404).json({ error: "Specs could not be identified." });
    }

    try {
      // Strategy 1: Direct JSON.parse (responseMimeType: "application/json" should give pure JSON)
      let parsedSpecs;
      try {
        parsedSpecs = JSON.parse(textReply.trim());
      } catch (_directErr) {
        // Strategy 2: Extract JSON object via regex
        const match = textReply.match(/\{[\s\S]*\}/);
        if (!match) {
          throw new Error("No JSON object found in AI response");
        }
        parsedSpecs = JSON.parse(match[0].trim());
      }

      console.log(`[IMEI Lookup] Parsed specs:`, parsedSpecs);
      res.json(parsedSpecs);
    } catch (parseErr) {
      console.error("Failed to parse Gemini response as JSON:", textReply, parseErr);
      res.status(502).json({ error: "Invalid specifications format returned by AI." });
    }
  } catch (err) {
    next(err);
  }
}
