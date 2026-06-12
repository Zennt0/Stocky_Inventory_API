import * as productService from "../services/product.service.js";
import logger from "../config/logger.js";

/** Safely parse an ID param — returns null if not a valid integer */
function parseId(val) {
  const n = parseInt(val, 10);
  return Number.isNaN(n) || n <= 0 ? null : n;
}

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

    const { products, total } = await productService.listProducts(req.user.id, {
      where,
      orderBy,
      skip,
      take,
    });

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
    const products = await productService.getLowStockProducts(req.user.id);
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
    const stats = await productService.getInventoryStats(req.user.id);
    res.json(stats);
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────
// GET /api/products/imei/:imei — Lookup by IMEI
// ──────────────────────────────────────────
export async function getByImei(req, res, next) {
  try {
    const product = await productService.findByImei(req.params.imei);

    if (!product || product.userId !== req.user.id) {
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
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid product ID." });

    const product = await productService.findById(id);

    if (!product || product.userId !== req.user.id) {
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

    const qty = quantity || 0;
    const status = productService.computeStatus(qty);

    const product = await productService.createProduct({
      brand,
      model,
      variant,
      storage,
      ram,
      color,
      imei,
      supplierId: supplierId ? parseInt(supplierId) : null,
      userId: req.user.id,
      purchasePrice: parseFloat(purchasePrice),
      sellingPrice: parseFloat(sellingPrice),
      quantity: qty,
      imageUrl,
      status,
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
      data.status = productService.computeStatus(data.quantity);
    }

    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid product ID." });

    const existing = await productService.findByIdLean(id);
    if (!existing || existing.userId !== req.user.id) {
      return res.status(404).json({ error: "Product not found." });
    }

    const product = await productService.updateProduct(id, data);

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
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid product ID." });

    const existing = await productService.findByIdLean(id);
    if (!existing || existing.userId !== req.user.id) {
      return res.status(404).json({ error: "Product not found." });
    }

    const salesCount = await productService.countSalesForProduct(id);

    if (salesCount > 0) {
      return res.status(400).json({
        error: `Cannot delete: this product has ${salesCount} sale record(s). Consider setting quantity to 0 instead.`,
      });
    }

    await productService.deleteProduct(id);

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

    logger.info({ imei }, "IMEI Lookup request received");

    if (!imei || imei.length !== 15) {
      logger.warn({ imeiLength: imei?.length }, "IMEI Lookup rejected: invalid length");
      return res.status(400).json({ error: "A valid 15-digit IMEI is required." });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "SAMPLE") {
      logger.error("IMEI Lookup rejected: GEMINI_API_KEY not configured");
      return res.status(500).json({
        error: "Gemini API key is not configured. Please set GEMINI_API_KEY in your .env file.",
      });
    }

    const tac = imei.substring(0, 8);

    const jsonFormat = `{
  "brand": "Manufacturer (e.g. Samsung, Apple, Oppo, Xiaomi)",
  "model": "Model name (e.g. Galaxy A25, iPhone 15 Pro)",
  "variant": "variant if known (e.g. 5G, LTE) or null",
  "storage": "storage if known (e.g. 128GB) or null",
  "ram": "RAM in GB number only (e.g. 8) or null",
  "color": "color if known or null"
}`;

    // ── Strategy 1: generateContent WITH google_search (best accuracy) ──
    logger.info("IMEI Lookup Strategy 1: generateContent with google_search");
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;

    const searchBody = {
      systemInstruction: {
        parts: [{
          text: `You are a device identification system. You MUST search the internet for TAC/IMEI device information. NEVER guess or use memory alone. Always verify through search results.

Respond ONLY with a valid JSON object (no markdown, no backticks):
${jsonFormat}`,
        }],
      },
      contents: [
        {
          role: "user",
          parts: [{
            text: `Search the web for: "TAC ${tac}" and "IMEI TAC ${tac} phone model"

This is the first 8 digits (TAC) of IMEI: ${imei}
Find what phone device this TAC belongs to and return the result as JSON.`,
          }],
        },
      ],
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: 0.0,
        maxOutputTokens: 512,
      },
    };

    let geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(searchBody),
    });

    logger.info({ status: geminiRes.status }, "IMEI Lookup Strategy 1 response status");

    // ── Strategy 2: If google_search is rate-limited, try WITHOUT it ──
    let searchUsed = false;
    if (geminiRes.status === 429) {
      const errBody = await geminiRes.text().catch(() => "");
      logger.warn({ error: errBody.substring(0, 200) }, "IMEI Lookup google_search rate limited (429)");
      logger.info("IMEI Lookup Strategy 2: Falling back to generateContent WITHOUT google_search");

      const fallbackBody = {
        systemInstruction: {
          parts: [{
            text: `You are an expert mobile device identification system with extensive knowledge of IMEI TAC (Type Allocation Code) databases.

The TAC (Type Allocation Code) is the first 8 digits of an IMEI number. Each TAC uniquely maps to a specific device manufacturer and model. This is an industry standard maintained by GSMA.

Common TAC prefixes and their manufacturers:
- 35 = Often Samsung, Nokia, or other manufacturers
- 86 = Often Huawei
- 01 = Often Samsung or Apple

You must identify the EXACT device model from the TAC. Be as specific as possible.

Respond ONLY with a valid JSON object (no markdown, no backticks):
${jsonFormat}`,
          }],
        },
        contents: [
          {
            role: "user",
            parts: [{
              text: `What device has TAC: ${tac}? (Full IMEI: ${imei})

Identify the exact brand and model for this TAC code. Return as JSON.`,
            }],
          },
        ],
        generationConfig: {
          temperature: 0.0,
          maxOutputTokens: 512,
        },
      };

      geminiRes = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fallbackBody),
      });

      logger.info({ status: geminiRes.status }, "IMEI Lookup Strategy 2 response status");
    } else {
      searchUsed = true;
    }

    // ── If STILL 429 even without google_search, give up ──
    if (geminiRes.status === 429) {
      const errBody = await geminiRes.text().catch(() => "");
      logger.error({ error: errBody.substring(0, 200) }, "IMEI Lookup base model also rate limited");
      return res.status(429).json({
        error: "AI lookup limit reached. Please try again in a few minutes.",
      });
    }

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => "");
      logger.error({ status: geminiRes.status, responseText: errText }, "IMEI Lookup Gemini API error");
      return res.status(502).json({ error: `Failed to query AI: ${geminiRes.status}` });
    }

    const geminiData = await geminiRes.json();

    // Check if google_search was actually used by looking for groundingMetadata
    if (searchUsed) {
      const groundingMeta = geminiData?.candidates?.[0]?.groundingMetadata;
      searchUsed = !!(groundingMeta?.searchEntryPoint || groundingMeta?.groundingChunks?.length);
    }
    logger.info({ searchUsed }, "IMEI Lookup search usage check");

    // Extract the text reply (last text part)
    const parts = geminiData?.candidates?.[0]?.content?.parts || [];
    const textReply = parts
      .filter((p) => typeof p.text === "string")
      .map((p) => p.text)
      .pop();

    logger.debug({ partsCount: parts.length, textReply }, "IMEI Lookup Gemini response details");

    if (!textReply) {
      const blockReason = geminiData?.promptFeedback?.blockReason;
      if (blockReason) {
        logger.warn({ blockReason }, "IMEI Lookup request blocked by safety filter");
        return res.status(502).json({ error: `AI request was blocked: ${blockReason}` });
      }
      return res.status(404).json({ error: "Specs could not be identified." });
    }

    const parsed = parseSpecsJson(textReply);
    if (!parsed) {
      logger.error({ textReply }, "IMEI Lookup failed to parse specs JSON");
      return res.status(502).json({ error: "Invalid specifications format returned by AI." });
    }

    // Warn if search wasn't used (result may be inaccurate)
    if (!searchUsed) {
      parsed._warning = "Result based on AI knowledge only (search was not used). Verify accuracy manually.";
      logger.warn("IMEI Lookup search not used, result may be less accurate");
    }

    logger.info({ result: parsed }, "IMEI Lookup final result");
    res.json(parsed);
  } catch (err) {
    next(err);
  }
}

/** Helper: safely parse a JSON specs string */
function parseSpecsJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text.trim());
  } catch (_) {
    // Try to extract JSON from surrounding text
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0].trim());
      } catch (__) {
        return null;
      }
    }
    return null;
  }
}
