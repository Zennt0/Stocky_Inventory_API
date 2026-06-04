import prisma from "../config/prisma.js";

// ──────────────────────────────────────────
// POST /api/chat — AI Chat with Gemini
// ──────────────────────────────────────────
export async function chat(req, res, next) {
  try {
    const { message } = req.body;
    const userId = Number(req.user.id);

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message is required." });
    }

    // ── 1. Gather live inventory context and history from database ──
    const [productStats, lowStockProducts, allProducts, salesStats, chatHistory] =
      await Promise.all([
        // Product overview stats
        (async () => {
          const [totalProducts, totalUnits, lowStockCount, inventoryData] =
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

          const totalValue = inventoryData.reduce(
            (sum, p) => sum + Number(p.sellingPrice) * p.quantity,
            0
          );

          return { totalProducts, totalUnits: totalUnits._sum.quantity || 0, lowStockCount, totalValue };
        })(),

        // Low stock products
        prisma.product.findMany({
          where: { status: { in: ["LOW_STOCK", "OUT_OF_STOCK"] } },
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
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const sales = await prisma.sale.findMany({
            where: { soldDate: { gte: today } },
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

        // Chat history for context (last 15 messages)
        prisma.chatMessage.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 15,
        }),
      ]);

    // ── 2. Build context string from live data ──
    const productListText = allProducts
      .map(
        (p) =>
          `- ${p.brand} ${p.model}${p.variant ? ` (${p.variant})` : ""}${p.color ? ` / ${p.color}` : ""}${p.storage ? ` / ${p.storage}` : ""}: ${p.quantity} units @ ₱${Number(p.sellingPrice).toLocaleString()} (Status: ${p.status})`
      )
      .join("\n");

    const lowStockText =
      lowStockProducts.length > 0
        ? lowStockProducts
            .map(
              (p) =>
                `- ⚠️ ${p.brand} ${p.model}${p.variant ? ` (${p.variant})` : ""}${p.color ? ` / ${p.color}` : ""}: ${p.quantity} unit(s) remaining (${p.status})`
            )
            .join("\n")
        : "No low stock items currently.";

    const inventoryContext = `
=== LIVE INVENTORY DATABASE ===
Total Products: ${productStats.totalProducts}
Total Units in Stock: ${productStats.totalUnits}
Low Stock / Out of Stock Items: ${productStats.lowStockCount}
Total Inventory Value: ₱${productStats.totalValue.toLocaleString()}

=== TODAY'S SALES ===
Sales Today: ${salesStats.totalSales}
Revenue Today: ₱${salesStats.totalRevenue.toLocaleString()}

=== LOW STOCK ALERTS ===
${lowStockText}

=== FULL PRODUCT LIST ===
${productListText}
`;

    // ── 3. Build Gemini API request with history ──
    const systemPrompt = `You are "Stocky", a friendly and knowledgeable AI inventory assistant for a phone/gadget retail store. You help staff check stock levels, sales data, and product information.

IMPORTANT RULES:
- You MUST answer stock levels, store prices, and quantities based on the REAL inventory data provided below. Never make up product names, prices, or quantities for store stock.
- SMARTPHONE SPECS SEARCH: If the user asks about the specifications, features, comparisons, retail prices, release date, or details of a specific smartphone model (whether it exists in our inventory list or not), you MUST search the internet using Google Search to get accurate and up-to-date specs.
- EMOJIS & FORMATTING: Use emojis to make responses engaging (📱, ⚠️, 📊, 💰, ✅, etc.). Format specs in a clean, structured bullet-point or table layout using markdown bold.
- If asked about store stock/sales of something not in the inventory data, say so honestly. But if they just ask for specifications of any phone, use Google Search to fetch them.
- LANGUAGE: You are bilingual. If the user writes in Filipino/Tagalog, respond in Filipino/Tagalog. If the user writes in English, respond in English. Match the user's language naturally. You can mix Taglish if the user does.
- When reporting low stock, always include the ⚠️ emoji and the exact remaining quantity.
- Philippine Peso symbol is ₱.

${inventoryContext}`;

    const sortedHistory = [...chatHistory].reverse();
    const contents = [];

    for (const msg of sortedHistory) {
      const role = msg.isUser ? "user" : "model";
      // First message in Gemini request must be user
      if (contents.length === 0 && role !== "user") {
        continue;
      }
      // Alternate roles, merge messages if they are consecutive
      if (contents.length > 0 && contents[contents.length - 1].role === role) {
        contents[contents.length - 1].parts[0].text += "\n" + msg.text;
      } else {
        contents.push({
          role,
          parts: [{ text: msg.text }],
        });
      }
    }

    // Append the current message
    if (contents.length > 0 && contents[contents.length - 1].role === "user") {
      contents[contents.length - 1].parts[0].text += "\n" + message;
    } else {
      contents.push({
        role: "user",
        parts: [{ text: message }],
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "SAMPLE") {
      return res.status(500).json({
        error: "Gemini API key is not configured. Please set GEMINI_API_KEY in your .env file.",
      });
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const geminiBody = {
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents,
      tools: [
        {
          google_search: {},
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
    };

    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });

    if (!geminiRes.ok) {
      const errData = await geminiRes.json().catch(() => ({}));
      console.error("Gemini API error:", geminiRes.status, errData);
      return res.status(502).json({
        error: "Failed to get response from AI. Please try again.",
      });
    }

    const geminiData = await geminiRes.json();
    const reply =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "I'm sorry, I couldn't generate a response. Please try again.";

    // ── 4. Determine if response contains warnings ──
    const containsWarning =
      reply.includes("⚠️") ||
      reply.toLowerCase().includes("low stock") ||
      reply.toLowerCase().includes("out of stock") ||
      reply.toLowerCase().includes("mababa ang stock") ||
      reply.toLowerCase().includes("ubos na");

    // ── 5. Save messages to the database ──
    try {
      await prisma.$transaction([
        prisma.chatMessage.create({
          data: {
            text: message,
            isUser: true,
            userId,
          },
        }),
        prisma.chatMessage.create({
          data: {
            text: reply,
            isUser: false,
            isAlert: containsWarning,
            isHappy: !containsWarning,
            userId,
          },
        }),
      ]);
    } catch (dbErr) {
      console.error("Failed to save chat message history:", dbErr);
      // We don't fail the request if saving history fails, but log it
    }

    res.json({ reply, containsWarning });
  } catch (err) {
    next(err);
  }
}

// ──────────────────────────────────────────
// GET /api/chat — Retrieve Chat History
// ──────────────────────────────────────────
export async function getHistory(req, res, next) {
  try {
    const userId = Number(req.user.id);
    const messages = await prisma.chatMessage.findMany({
      where: { userId },
      orderBy: {
        createdAt: "asc",
      },
    });
    res.json(messages);
  } catch (err) {
    next(err);
  }
}

