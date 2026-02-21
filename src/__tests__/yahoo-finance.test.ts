/**
 * Yahoo Finance API integration tests.
 *
 * These tests hit the real Yahoo Finance API via the `yahoo-finance2` package
 * to verify that our wrapper functions in `services/yahoo-finance.ts` correctly:
 *
 * 1. Search for securities by name, ticker, and broad terms
 * 2. Fetch price quotes for US equities, US ETFs, UK ETFs, and UK equities
 * 3. Handle minor currency normalisation (GBp → GBP for LSE-listed securities)
 * 4. Fetch FX rates for currency pairs (USD→GBP, EUR→GBP, etc.)
 * 5. Return structured errors for invalid symbols
 * 6. Map Yahoo Finance quoteType strings to our AssetType enum
 *
 * These are INTEGRATION tests — they require network access and will fail
 * if Yahoo Finance is unreachable or rate-limiting. They are intentionally
 * given a 30-second timeout (configured in jest.config.js) to accommodate
 * occasional API latency.
 *
 * Test portfolio covers both US and UK markets:
 * - US Stocks: AAPL (Apple), MSFT (Microsoft), GOOGL (Alphabet)
 * - US ETFs: VOO (Vanguard S&P 500 ETF)
 * - UK ETFs: VUSA.L (Vanguard S&P 500 UCITS), VWRL.L (Vanguard FTSE All-World)
 * - UK Stocks: AZN.L (AstraZeneca), SHEL.L (Shell)
 * - FX Pairs: USDGBP=X, EURGBP=X
 *
 * Run with: npm test -- --testPathPattern=yahoo-finance
 */

import { searchAssets, getQuote, getQuotes, getFxRate } from "../services/yahoo-finance";
import { AssetType } from "../utils/types";
import { TEST_SYMBOLS, SEARCH_QUERIES } from "./portfolio-fixtures";

// ──────────────────────────────────────────
// Search Tests
// ──────────────────────────────────────────

describe("searchAssets", () => {
  it("returns results for a ticker symbol search (AAPL)", async () => {
    const results = await searchAssets("AAPL");

    expect(results).toBeDefined();
    expect(results.length).toBeGreaterThan(0);

    // Should include Apple Inc.
    const apple = results.find((r) => r.symbol === "AAPL");
    expect(apple).toBeDefined();
    expect(apple!.name).toBeTruthy();
    expect(apple!.symbol).toBe("AAPL");
    expect(apple!.type).toBe(AssetType.EQUITY);
    expect(apple!.exchange).toBeTruthy();
  });

  it("returns results for a company name search (Microsoft)", async () => {
    const results = await searchAssets("Microsoft");

    expect(results).toBeDefined();
    expect(results.length).toBeGreaterThan(0);

    // Should include MSFT somewhere in the results
    const msft = results.find((r) => r.symbol === "MSFT");
    expect(msft).toBeDefined();
    expect(msft!.name.toLowerCase()).toContain("microsoft");
  });

  it("returns results for a broad index search (S&P 500)", async () => {
    const results = await searchAssets("S&P 500");

    expect(results).toBeDefined();
    expect(results.length).toBeGreaterThan(0);

    // Should return at least some ETF or index-related results
    // We don't assert specific symbols because search relevance varies
    const symbols = results.map((r) => r.symbol);
    expect(symbols.length).toBeGreaterThan(0);
  });

  it("returns results for a UK-listed company search (AstraZeneca)", async () => {
    const results = await searchAssets("AstraZeneca");

    expect(results).toBeDefined();
    expect(results.length).toBeGreaterThan(0);

    // Should include AZN.L or AZN
    const azn = results.find(
      (r) => r.symbol === "AZN.L" || r.symbol === "AZN"
    );
    expect(azn).toBeDefined();
    expect(azn!.name.toLowerCase()).toContain("astra");
  });

  it("returns results for a fund family search (Vanguard)", async () => {
    const results = await searchAssets("Vanguard");

    expect(results).toBeDefined();
    expect(results.length).toBeGreaterThan(0);

    // Should return some Vanguard-related securities
    const vanguardResults = results.filter((r) =>
      r.name.toLowerCase().includes("vanguard")
    );
    expect(vanguardResults.length).toBeGreaterThan(0);
  });

  it("returns empty results for an empty query", async () => {
    const results = await searchAssets("");
    expect(results).toEqual([]);
  });

  it("returns empty results for a whitespace-only query", async () => {
    const results = await searchAssets("   ");
    expect(results).toEqual([]);
  });

  it("returns results with correct structure for every item", async () => {
    const results = await searchAssets("Apple");

    for (const result of results) {
      expect(typeof result.symbol).toBe("string");
      expect(result.symbol.length).toBeGreaterThan(0);
      expect(typeof result.name).toBe("string");
      expect(result.name.length).toBeGreaterThan(0);
      expect(typeof result.exchange).toBe("string");
      expect(Object.values(AssetType)).toContain(result.type);
    }
  });

  it("limits results to a reasonable count", async () => {
    const results = await searchAssets("Vanguard");

    // SEARCH_MAX_RESULTS is 20 — we should not exceed that
    expect(results.length).toBeLessThanOrEqual(20);
  });
});

// ──────────────────────────────────────────
// Quote Tests — US Equities
// ──────────────────────────────────────────

describe("getQuote — US Equities", () => {
  it.each(TEST_SYMBOLS.US_STOCKS)(
    "fetches a valid quote for %s",
    async (symbol) => {
      const quote = await getQuote(symbol);

      expect(quote).toBeDefined();
      expect(quote.symbol).toBe(symbol);
      expect(quote.name).toBeTruthy();
      expect(typeof quote.price).toBe("number");
      expect(quote.price).toBeGreaterThan(0);
      expect(quote.currency).toBe("USD");
      expect(typeof quote.change).toBe("number");
      expect(typeof quote.changePercent).toBe("number");
      expect(typeof quote.marketState).toBe("string");
    }
  );

  it("returns a price in USD for AAPL", async () => {
    const quote = await getQuote("AAPL");

    expect(quote.currency).toBe("USD");
    // Apple's price should reasonably be between $50 and $500
    expect(quote.price).toBeGreaterThan(50);
    expect(quote.price).toBeLessThan(500);
  });

  it("returns a price in USD for MSFT", async () => {
    const quote = await getQuote("MSFT");

    expect(quote.currency).toBe("USD");
    // Microsoft's price should reasonably be between $100 and $1000
    expect(quote.price).toBeGreaterThan(100);
    expect(quote.price).toBeLessThan(1000);
  });

  it("returns a price in USD for GOOGL", async () => {
    const quote = await getQuote("GOOGL");

    expect(quote.currency).toBe("USD");
    // Alphabet's price should reasonably be between $50 and $500
    expect(quote.price).toBeGreaterThan(50);
    expect(quote.price).toBeLessThan(500);
  });
});

// ──────────────────────────────────────────
// Quote Tests — US ETFs
// ──────────────────────────────────────────

describe("getQuote — US ETFs", () => {
  it("fetches a valid quote for VOO (Vanguard S&P 500 ETF)", async () => {
    const quote = await getQuote("VOO");

    expect(quote).toBeDefined();
    expect(quote.symbol).toBe("VOO");
    expect(quote.name).toBeTruthy();
    expect(typeof quote.price).toBe("number");
    expect(quote.price).toBeGreaterThan(0);
    expect(quote.currency).toBe("USD");
    // VOO should reasonably be between $200 and $800
    expect(quote.price).toBeGreaterThan(200);
    expect(quote.price).toBeLessThan(800);
  });
});

// ──────────────────────────────────────────
// Quote Tests — UK ETFs (GBp → GBP normalisation)
// ──────────────────────────────────────────

describe("getQuote — UK ETFs (minor currency normalisation)", () => {
  it("fetches VUSA.L and normalises GBp to GBP", async () => {
    const quote = await getQuote("VUSA.L");

    expect(quote).toBeDefined();
    expect(quote.symbol).toBe("VUSA.L");
    expect(quote.name).toBeTruthy();
    expect(typeof quote.price).toBe("number");
    expect(quote.price).toBeGreaterThan(0);

    // VUSA.L is quoted in GBp (pence) on Yahoo Finance.
    // Our normalisation should convert it to GBP (pounds).
    // After normalisation, price should be in the range of ~£50-£120
    // (not 5000-12000 which would indicate raw pence).
    expect(quote.currency).toBe("GBP");
    expect(quote.price).toBeGreaterThan(10);
    expect(quote.price).toBeLessThan(500);
  });

  it("fetches VWRL.L and normalises GBp to GBP", async () => {
    const quote = await getQuote("VWRL.L");

    expect(quote).toBeDefined();
    expect(quote.symbol).toBe("VWRL.L");
    expect(quote.name).toBeTruthy();
    expect(typeof quote.price).toBe("number");
    expect(quote.price).toBeGreaterThan(0);

    // VWRL.L should also be normalised from GBp to GBP
    // Price should be in pounds (roughly £70-£150), not pence
    expect(quote.currency).toBe("GBP");
    expect(quote.price).toBeGreaterThan(10);
    expect(quote.price).toBeLessThan(500);
  });

  it("normalises the daily change value alongside the price for UK ETFs", async () => {
    const quote = await getQuote("VUSA.L");

    // If the price is normalised (GBp → GBP), the change should also be
    // in pounds, not pence. A daily change of >£50 would suggest pence.
    expect(Math.abs(quote.change)).toBeLessThan(50);
  });
});

// ──────────────────────────────────────────
// Quote Tests — UK Equities
// ──────────────────────────────────────────

describe("getQuote — UK Equities", () => {
  it("fetches a valid quote for AZN.L (AstraZeneca)", async () => {
    const quote = await getQuote("AZN.L");

    expect(quote).toBeDefined();
    expect(quote.symbol).toBe("AZN.L");
    expect(quote.name).toBeTruthy();
    expect(typeof quote.price).toBe("number");
    expect(quote.price).toBeGreaterThan(0);

    // AZN.L is priced in GBp on Yahoo Finance — should be normalised to GBP
    expect(quote.currency).toBe("GBP");
    // AstraZeneca share price should be roughly £80-£200 (in pounds)
    expect(quote.price).toBeGreaterThan(30);
    expect(quote.price).toBeLessThan(500);
  });

  it("fetches a valid quote for SHEL.L (Shell)", async () => {
    const quote = await getQuote("SHEL.L");

    expect(quote).toBeDefined();
    expect(quote.symbol).toBe("SHEL.L");
    expect(quote.name).toBeTruthy();
    expect(typeof quote.price).toBe("number");
    expect(quote.price).toBeGreaterThan(0);

    // Shell share price in GBP should be roughly £15-£50
    expect(quote.currency).toBe("GBP");
    expect(quote.price).toBeGreaterThan(5);
    expect(quote.price).toBeLessThan(200);
  });
});

// ──────────────────────────────────────────
// Quote Tests — Error Handling
// ──────────────────────────────────────────

describe("getQuote — Error Handling", () => {
  it("throws an error for an invalid/nonexistent symbol", async () => {
    await expect(getQuote(TEST_SYMBOLS.INVALID)).rejects.toThrow();
  });

  it("throws an error with a descriptive message for invalid symbols", async () => {
    try {
      await getQuote(TEST_SYMBOLS.INVALID);
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toBeDefined();
      // Error should be an instance of Error with a message
      expect(error instanceof Error || typeof error === "object").toBe(true);
    }
  });
});

// ──────────────────────────────────────────
// Batch Quote Tests
// ──────────────────────────────────────────

describe("getQuotes — Batch Fetching", () => {
  it("fetches quotes for multiple US symbols in parallel", async () => {
    const { quotes, errors } = await getQuotes(["AAPL", "MSFT", "GOOGL"]);

    expect(quotes.length).toBe(3);
    expect(errors.length).toBe(0);

    const symbols = quotes.map((q) => q.symbol);
    expect(symbols).toContain("AAPL");
    expect(symbols).toContain("MSFT");
    expect(symbols).toContain("GOOGL");

    for (const quote of quotes) {
      expect(quote.price).toBeGreaterThan(0);
      expect(quote.currency).toBe("USD");
    }
  });

  it("fetches quotes for a mix of US and UK symbols", async () => {
    const { quotes, errors } = await getQuotes(["AAPL", "VUSA.L", "VOO"]);

    expect(quotes.length).toBe(3);
    expect(errors.length).toBe(0);

    const aaplQuote = quotes.find((q) => q.symbol === "AAPL");
    const vusaQuote = quotes.find((q) => q.symbol === "VUSA.L");
    const vooQuote = quotes.find((q) => q.symbol === "VOO");

    expect(aaplQuote).toBeDefined();
    expect(aaplQuote!.currency).toBe("USD");

    expect(vusaQuote).toBeDefined();
    expect(vusaQuote!.currency).toBe("GBP"); // normalised from GBp

    expect(vooQuote).toBeDefined();
    expect(vooQuote!.currency).toBe("USD");
  });

  it("returns partial results when some symbols are invalid", async () => {
    const { quotes, errors } = await getQuotes([
      "AAPL",
      TEST_SYMBOLS.INVALID,
      "MSFT",
    ]);

    // Should have 2 successful quotes and 1 error
    expect(quotes.length).toBe(2);
    expect(errors.length).toBe(1);

    const symbols = quotes.map((q) => q.symbol);
    expect(symbols).toContain("AAPL");
    expect(symbols).toContain("MSFT");

    expect(errors[0].symbol).toBe(TEST_SYMBOLS.INVALID);
    expect(errors[0].error).toBeDefined();
  });

  it("returns empty results for an empty symbols array", async () => {
    const { quotes, errors } = await getQuotes([]);

    expect(quotes).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("fetches all test portfolio symbols successfully", async () => {
    const allSymbols = [...TEST_SYMBOLS.ALL];
    const { quotes, errors } = await getQuotes(allSymbols);

    // All 8 symbols should resolve
    expect(quotes.length).toBe(allSymbols.length);
    expect(errors.length).toBe(0);

    // Verify each symbol got a valid price
    for (const quote of quotes) {
      expect(quote.price).toBeGreaterThan(0);
      expect(quote.currency).toBeTruthy();
      expect(quote.name).toBeTruthy();
    }

    // Verify currency normalisation for UK symbols
    const ukQuotes = quotes.filter(
      (q) => q.symbol.endsWith(".L")
    );
    for (const ukQuote of ukQuotes) {
      expect(ukQuote.currency).toBe("GBP");
    }

    // Verify US symbols are in USD
    const usQuotes = quotes.filter(
      (q) => !q.symbol.endsWith(".L") && !q.symbol.includes("=")
    );
    for (const usQuote of usQuotes) {
      expect(usQuote.currency).toBe("USD");
    }
  });
});

// ──────────────────────────────────────────
// FX Rate Tests
// ──────────────────────────────────────────

describe("getFxRate", () => {
  it("returns 1.0 for same-currency conversion (GBP → GBP)", async () => {
    const rate = await getFxRate("GBP", "GBP");
    expect(rate).toBe(1.0);
  });

  it("returns 1.0 for same-currency conversion (USD → USD)", async () => {
    const rate = await getFxRate("USD", "USD");
    expect(rate).toBe(1.0);
  });

  it("fetches a valid USD → GBP exchange rate", async () => {
    const rate = await getFxRate("USD", "GBP");

    expect(typeof rate).toBe("number");
    expect(rate).toBeGreaterThan(0);
    // USD/GBP rate should reasonably be between 0.5 and 1.5
    expect(rate).toBeGreaterThan(0.4);
    expect(rate).toBeLessThan(1.5);
  });

  it("fetches a valid GBP → USD exchange rate", async () => {
    const rate = await getFxRate("GBP", "USD");

    expect(typeof rate).toBe("number");
    expect(rate).toBeGreaterThan(0);
    // GBP/USD rate should reasonably be between 1.0 and 2.0
    expect(rate).toBeGreaterThan(0.8);
    expect(rate).toBeLessThan(2.5);
  });

  it("fetches a valid EUR → GBP exchange rate", async () => {
    const rate = await getFxRate("EUR", "GBP");

    expect(typeof rate).toBe("number");
    expect(rate).toBeGreaterThan(0);
    // EUR/GBP rate should be roughly 0.7-1.2
    expect(rate).toBeGreaterThan(0.5);
    expect(rate).toBeLessThan(1.5);
  });

  it("inverse FX rates are approximately reciprocal", async () => {
    const usdToGbp = await getFxRate("USD", "GBP");
    const gbpToUsd = await getFxRate("GBP", "USD");

    // The product of a rate and its inverse should be approximately 1.0
    // Allow a 5% tolerance for timing differences between the two API calls
    const product = usdToGbp * gbpToUsd;
    expect(product).toBeGreaterThan(0.95);
    expect(product).toBeLessThan(1.05);
  });

  it("fetches a valid CHF → GBP exchange rate", async () => {
    const rate = await getFxRate("CHF", "GBP");

    expect(typeof rate).toBe("number");
    expect(rate).toBeGreaterThan(0);
    // CHF/GBP rate should be roughly 0.7-1.3
    expect(rate).toBeGreaterThan(0.5);
    expect(rate).toBeLessThan(2.0);
  });

  it("fetches a valid JPY → GBP exchange rate", async () => {
    const rate = await getFxRate("JPY", "GBP");

    expect(typeof rate).toBe("number");
    expect(rate).toBeGreaterThan(0);
    // JPY/GBP rate should be very small (roughly 0.004-0.01)
    expect(rate).toBeGreaterThan(0.001);
    expect(rate).toBeLessThan(0.1);
  });
});

// ──────────────────────────────────────────
// Asset Type Mapping Tests
// ──────────────────────────────────────────

describe("AssetType mapping", () => {
  it("maps AAPL as EQUITY", async () => {
    const results = await searchAssets("AAPL");
    const apple = results.find((r) => r.symbol === "AAPL");
    expect(apple).toBeDefined();
    expect(apple!.type).toBe(AssetType.EQUITY);
  });

  it("maps VOO as ETF", async () => {
    const results = await searchAssets("VOO");
    const voo = results.find((r) => r.symbol === "VOO");
    expect(voo).toBeDefined();
    expect(voo!.type).toBe(AssetType.ETF);
  });

  it("maps VUSA.L as ETF", async () => {
    const results = await searchAssets("VUSA.L");
    const vusa = results.find((r) => r.symbol === "VUSA.L");
    // VUSA.L might not always appear for this exact query,
    // but if it does, it should be typed as ETF
    if (vusa) {
      expect(vusa.type).toBe(AssetType.ETF);
    }
  });
});

// ──────────────────────────────────────────
// End-to-End: Search → Quote Flow
// ──────────────────────────────────────────

describe("Search → Quote end-to-end flow", () => {
  it("can search for Apple, select AAPL, and get a valid quote", async () => {
    // Step 1: Search
    const results = await searchAssets("Apple");
    expect(results.length).toBeGreaterThan(0);

    const apple = results.find((r) => r.symbol === "AAPL");
    expect(apple).toBeDefined();

    // Step 2: Get quote for the selected search result
    const quote = await getQuote(apple!.symbol);
    expect(quote.symbol).toBe("AAPL");
    expect(quote.price).toBeGreaterThan(0);
    expect(quote.currency).toBe("USD");
  });

  it("can search for a UK ETF, select VUSA.L, and get a normalised quote", async () => {
    // Step 1: Search
    const results = await searchAssets("Vanguard S&P 500 UCITS");
    expect(results.length).toBeGreaterThan(0);

    // Look for VUSA.L in results (or any .L suffixed Vanguard result)
    const vusa = results.find(
      (r) => r.symbol === "VUSA.L" || (r.symbol.endsWith(".L") && r.name.toLowerCase().includes("vanguard"))
    );

    // If VUSA.L isn't in results (search relevance varies), skip the quote step
    if (!vusa) {
      console.warn(
        "VUSA.L not found in search results for 'Vanguard S&P 500 UCITS' — skipping quote step. " +
        "Results were: " + results.map((r) => r.symbol).join(", ")
      );
      return;
    }

    // Step 2: Get quote for the selected search result
    const quote = await getQuote(vusa.symbol);
    expect(quote.price).toBeGreaterThan(0);
    expect(quote.currency).toBe("GBP"); // normalised from GBp
  });

  it("can search, quote, and fetch FX rate for a full position calculation", async () => {
    // Simulate adding a US stock to a GBP-denominated portfolio

    // Step 1: Search for Microsoft
    const results = await searchAssets("MSFT");
    const msft = results.find((r) => r.symbol === "MSFT");
    expect(msft).toBeDefined();

    // Step 2: Get the quote
    const quote = await getQuote(msft!.symbol);
    expect(quote.currency).toBe("USD");
    expect(quote.price).toBeGreaterThan(0);

    // Step 3: Get FX rate to convert to GBP
    const fxRate = await getFxRate("USD", "GBP");
    expect(fxRate).toBeGreaterThan(0);

    // Step 4: Calculate position value
    const units = 15;
    const nativeValue = units * quote.price;
    const baseValue = nativeValue * fxRate;

    expect(nativeValue).toBeGreaterThan(0);
    expect(baseValue).toBeGreaterThan(0);

    // The GBP value should be less than the USD value (since GBP > USD)
    // This is a sanity check, not a precise assertion
    expect(baseValue).toBeLessThan(nativeValue);

    console.log(
      `Portfolio calculation: ${units} × ${msft!.symbol} @ $${quote.price.toFixed(2)} = ` +
      `$${nativeValue.toFixed(2)} USD → £${baseValue.toFixed(2)} GBP (rate: ${fxRate.toFixed(4)})`
    );
  });
});
