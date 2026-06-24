import * as chatService from "../services/chat.service.js";
import logger from "../config/logger.js";

// ──────────────────────────────────────────
// Intent Detection — Keyword-based classifier
// ──────────────────────────────────────────

/**
 * Classifies a user message into one of three intents:
 *   - "inventory" → stock levels, prices, sales data (needs full DB context)
 *   - "specs"     → phone specifications, comparisons (needs Google Search, NOT DB context)
 *   - "general"   → greetings, casual chat (needs minimal context)
 */
function detectIntent(message) {
  const lower = message.toLowerCase();

  // Specs-related keywords (Filipino + English)
  const specsKeywords = [
    "specs", "specification", "specifications", "features", "camera",
    "battery", "display", "screen size", "processor", "chipset", "chip",
    "compare", "comparison", "review", "release date", "dimensions",
    "weight", "megapixel", "refresh rate", "oled", "amoled",
    // Filipino keywords
    "hanapin", "hanapin mo", "ano specs", "ano ba specs", "specs ng",
    "specs nang", "specs of", "ano features", "gaano kalaki", "anong processor",
  ];

  // Inventory-related keywords (Filipino + English)
  const inventoryKeywords = [
    "stock", "inventory", "low stock", "out of stock", "sold",
    "sales", "revenue", "profit", "how many", "quantity", "units",
    "available", "price", "presyo", "magkano", "ilan",
    "ubos", "mababa", "naubos", "natitirang", "remaining",
    "today's sales", "weekly", "monthly", "brand", "list",
    "all products", "product list", "mga produkto", "mga stock",
  ];

  const isSpecs = specsKeywords.some((k) => lower.includes(k));
  const isInventory = inventoryKeywords.some((k) => lower.includes(k));

  // If both match (e.g. "do we have iPhone 15 in stock and what are its specs?"), prefer inventory
  if (isSpecs && !isInventory) return "specs";
  if (isInventory) return "inventory";
  return "general";
}

/**
 * Extracts all text parts from a Gemini API response.
 * When google_search is used, Gemini returns multiple content parts;
 * the actual text reply is spread across several parts (not just parts[0]).
 */
function extractReplyText(geminiData) {
  const parts = geminiData?.candidates?.[0]?.content?.parts || [];
  const textParts = parts
    .filter((p) => typeof p.text === "string")
    .map((p) => p.text);

  return textParts.join("\n") || "I'm sorry, I couldn't generate a response. Please try again.";
}

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

    // ── 1. Detect intent to decide what context to load ──
    const intent = detectIntent(message);
    logger.info({ intent, message: message.substring(0, 80) }, "[Chat] Intent detected");

    // ── 2. Load context based on intent (parallel with chat history) ──
    let inventoryContext = "";

    if (intent === "inventory") {
      // Full inventory context — needed for stock/sales questions
      const inventoryData = await chatService.getInventoryContext(userId);

      const { productStats, lowStockProducts, allProducts, salesStats, recentSales } = inventoryData;

      // Build context strings
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

      const recentSalesText =
        recentSales.length > 0
          ? recentSales
              .map((s) => {
                const date = new Date(s.soldDate);
                const dateStr = date.toLocaleDateString("en-PH", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const profit = Number(s.soldPrice) - Number(s.product.purchasePrice);
                return `- ${s.product.brand} ${s.product.model}${s.product.variant ? ` (${s.product.variant})` : ""}${s.product.color ? ` / ${s.product.color}` : ""} — Sold for ₱${Number(s.soldPrice).toLocaleString()} (Profit: ₱${profit.toLocaleString()}) by Staff on ${dateStr}`;
              })
              .join("\n")
          : "No sales recorded in the last 7 days.";

      const weeklyRevenue = recentSales.reduce((sum, s) => sum + Number(s.soldPrice), 0);
      const weeklyProfit = recentSales.reduce(
        (sum, s) => sum + (Number(s.soldPrice) - Number(s.product.purchasePrice)),
        0
      );

      inventoryContext = `
=== LIVE INVENTORY DATABASE ===
Total Products: ${productStats.totalProducts}
Total Units in Stock: ${productStats.totalUnits}
Low Stock / Out of Stock Items: ${productStats.lowStockCount}
Total Inventory Value: ₱${productStats.totalValue.toLocaleString()}

=== TODAY'S SALES ===
Sales Today: ${salesStats.totalSales}
Revenue Today: ₱${salesStats.totalRevenue.toLocaleString()}

=== LAST 7 DAYS SALES SUMMARY ===
Total Sales (7 days): ${recentSales.length}
Total Revenue (7 days): ₱${weeklyRevenue.toLocaleString()}
Total Profit (7 days): ₱${weeklyProfit.toLocaleString()}

=== RECENT SALES (Individual Records) ===
${recentSalesText}

=== LOW STOCK ALERTS ===
${lowStockText}

=== FULL PRODUCT LIST ===
${productListText}
`;
    } else if (intent === "general") {
      // Minimal context — just a quick summary so Stocky knows the store exists
      const minimalStats = await chatService.getMinimalContext(userId);

      inventoryContext = `
=== STORE SUMMARY ===
Total Products: ${minimalStats.totalProducts}
Total Units in Stock: ${minimalStats.totalUnits}
Low Stock / Out of Stock Items: ${minimalStats.lowStockCount}
(Full inventory data is available if the user asks about stock, sales, or specific products.)
`;
    }
    // For "specs" intent → no inventory context needed at all

    // ── 3. Load chat history ──
    const historyLimit = intent === "specs" ? 8 : intent === "general" ? 10 : 15;
    const chatHistory = await chatService.getRecentHistory(userId, historyLimit);

    // ── 4. Build the system prompt ──
    const systemPrompt = `You are "Stocky", a friendly and knowledgeable AI inventory assistant for a phone/gadget retail store. You help staff check stock levels, sales data, and product information.

CRITICAL RULES:
- ANSWER ONLY WHAT THE USER ASKS: Do NOT include stock levels, sales data, low stock alerts, or any inventory information unless the user specifically asks about stock, sales, prices, or inventory. If the user asks about phone specs, ONLY provide specs.
- FOCUS ON LATEST USER MESSAGE ONLY: Focus exclusively on answering the user's LATEST message. Do NOT proactively re-answer, update, correct, or reference past questions or topics from the conversation history.
- You MUST answer stock levels, store prices, and quantities based on the REAL inventory data provided below (if any). Never make up product names, prices, or quantities for store stock.
- SMARTPHONE SPECS SEARCH: If the user asks about the specifications, features, comparisons, retail prices, release date, or details of a specific smartphone model (whether it exists in our inventory list or not), you MUST search the internet using Google Search to get accurate and up-to-date specs. Provide COMPLETE and DETAILED specs — do not summarize or shorten.
- EMOJIS & FORMATTING: Use emojis to make responses engaging (📱, ⚠️, 📊, 💰, ✅, etc.). Format specs in a clean, structured bullet-point layout using markdown bold.
- If asked about store stock/sales of something not in the inventory data, say so honestly. But if they just ask for specifications of any phone, use Google Search to fetch them.
- LANGUAGE: You are bilingual. If the user writes in Filipino/Tagalog, respond in Filipino/Tagalog. If the user writes in English, respond in English. Match the user's language naturally. You can mix Taglish if the user does.
- When reporting low stock, always include the ⚠️ emoji and the exact remaining quantity.
- Philippine Peso symbol is ₱.
${inventoryContext}`;

    // ── 5. Build conversation history for Gemini ──
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
        maxOutputTokens: 4096,
      },
    };

    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });

    // ── Handle Gemini API errors with quota-aware fallback ──
    if (!geminiRes.ok) {
      const errData = await geminiRes.json().catch(() => ({}));
      logger.error({ status: geminiRes.status, errData }, "Gemini API error");

      // If 429 (quota/rate limit), try again WITHOUT google_search
      if (geminiRes.status === 429) {
        logger.warn("[Chat] google_search quota hit (429). Retrying without search...");
        const fallbackBody = { ...geminiBody };
        delete fallbackBody.tools; // Remove google_search tool
        fallbackBody.generationConfig.temperature = 0.5;

        const fallbackRes = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fallbackBody),
        });

        if (fallbackRes.ok) {
          logger.info("[Chat] Fallback (no-search) succeeded.");
          const fallbackData = await fallbackRes.json();
          const fallbackReply = extractReplyText(fallbackData);

          // Prefix with a small note that search wasn't available
          const reply = fallbackReply + "\n\n_💡 Note: Internet search was temporarily unavailable. Specs/comparison answers may be less accurate._";

          const containsWarning =
            reply.includes("⚠️") ||
            reply.toLowerCase().includes("low stock") ||
            reply.toLowerCase().includes("out of stock");

          try {
            await chatService.saveChatExchange(userId, message, reply, containsWarning);
          } catch (dbErr) {
            logger.error({ err: dbErr }, "Failed to save chat message history");
          }

          return res.json({ reply, containsWarning });
        }

        // If fallback ALSO fails with 429, return a friendly quota message
        logger.error("[Chat] Fallback also failed. Returning quota exceeded message.");
        const quotaReply = "⏳ Ay! Naka-reach na ako sa aking message limit para ngayon. Please try again in a few minutes! 🙏\n\n_Stocky needs a short break to recharge._";

        try {
          await chatService.saveChatExchange(userId, message, quotaReply, true);
        } catch (dbErr) {
          logger.error({ err: dbErr }, "Failed to save chat message history");
        }

        return res.json({ reply: quotaReply, containsWarning: true, quotaExceeded: true });
      }

      return res.status(502).json({
        error: "Failed to get response from AI. Please try again.",
      });
    }

    const geminiData = await geminiRes.json();
    const reply = extractReplyText(geminiData);

    // ── 6. Determine if response contains warnings ──
    const containsWarning =
      reply.includes("⚠️") ||
      reply.toLowerCase().includes("low stock") ||
      reply.toLowerCase().includes("out of stock") ||
      reply.toLowerCase().includes("mababa ang stock") ||
      reply.toLowerCase().includes("ubos na");

    // ── 7. Save messages to the database ──
    try {
      await chatService.saveChatExchange(userId, message, reply, containsWarning);
    } catch (dbErr) {
      logger.error({ err: dbErr }, "Failed to save chat message history");
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
    const messages = await chatService.getChatHistory(userId);
    res.json(messages);
  } catch (err) {
    next(err);
  }
}
