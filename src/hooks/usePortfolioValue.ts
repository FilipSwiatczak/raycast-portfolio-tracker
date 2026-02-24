/**
 * React hook for aggregated portfolio valuation with FX conversion.
 *
 * This is the "brain" of the portfolio display. It takes the raw portfolio
 * (accounts + positions) and computes the full valuation tree:
 *
 *   PortfolioValuation
 *   ├── totalValue (in base currency)
 *   ├── baseCurrency
 *   └── accounts[]
 *       ├── totalBaseValue
 *       └── positions[]
 *           ├── currentPrice (native currency)
 *           ├── totalNativeValue (units × price)
 *           ├── totalBaseValue (native × FX rate)
 *           ├── change / changePercent
 *           └── fxRate
 *
 * Responsibilities:
 * 1. Collect all unique symbols from the portfolio
 * 2. Batch-fetch prices (via daily cache — at most 1 API call per symbol per day)
 * 3. Collect all unique currencies and fetch FX rates to base currency
 * 4. Fetch HPI data for property positions (via property-price service)
 * 5. Compute per-position, per-account, and total valuations
 * 6. Expose loading, error, and refresh states
 *
 * Design:
 * - Composes `useAssetPrices` for price data and manages FX rates directly
 * - Memoises the valuation computation to avoid recalculating on every render
 * - Returns structured PortfolioValuation for direct consumption by UI components
 * - Handles partial failures gracefully (missing prices/FX rates don't crash the whole view)
 * - Property positions (MORTGAGE / OWNED_PROPERTY) are valued via UK HPI data
 *   and mortgage amortization calculations, not Yahoo Finance quotes
 */

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { getPreferenceValues } from "@raycast/api";
import {
  Portfolio,
  PortfolioValuation,
  AccountValuation,
  PositionValuation,
  CachedPrice,
  CachedFxRate,
  PortfolioError,
  ExtensionPreferences,
  ErrorType,
  AssetType,
  Position,
  isPropertyAssetType,
} from "../utils/types";
import { getCachedPrices, getCachedFxRates } from "../services/price-cache";
import { createPortfolioError } from "../utils/errors";
import { PropertyPriceChange, getPropertyPriceChange, getPropertyPriceChangeSync } from "../services/property-price";
import { calculateCurrentEquity } from "../services/mortgage-calculator";

// ──────────────────────────────────────────
// Return Type
// ──────────────────────────────────────────

export interface UsePortfolioValueReturn {
  /** The full computed portfolio valuation, or undefined while loading */
  valuation: PortfolioValuation | undefined;

  /** Whether price/FX data is currently being fetched */
  isLoading: boolean;

  /** Array of errors encountered during price/FX fetching */
  errors: PortfolioError[];

  /** The user's configured base currency (e.g. "GBP") */
  baseCurrency: string;

  /** Manually trigger a refresh of all prices and FX rates */
  refresh: () => void;
}

// ──────────────────────────────────────────
// Property Position Helpers
// ──────────────────────────────────────────

/**
 * Builds a unique cache-key for a property position's HPI lookup.
 * Uses postcode + valuation date to deduplicate requests for the same property data.
 */
function propertyHPIKey(position: Position): string | null {
  if (!position.mortgageData) return null;
  const pc = position.mortgageData.postcode.replace(/\s+/g, "").toUpperCase();
  return `${pc}:${position.mortgageData.valuationDate}`;
}

// ──────────────────────────────────────────
// Hook Implementation
// ──────────────────────────────────────────

/**
 * Computes a full portfolio valuation with live prices and FX conversion.
 *
 * @param portfolio - The current portfolio state (from usePortfolio). Pass undefined to skip.
 * @returns Valuation data, loading state, errors, and refresh function
 *
 * @example
 * function PortfolioView() {
 *   const { portfolio } = usePortfolio();
 *   const { valuation, isLoading, errors, refresh } = usePortfolioValue(portfolio);
 *
 *   if (isLoading) return <List isLoading />;
 *
 *   return (
 *     <List>
 *       <List.Section title={`Total: ${formatCurrency(valuation.totalValue, valuation.baseCurrency)}`}>
 *         ...
 *       </List.Section>
 *     </List>
 *   );
 * }
 */
export function usePortfolioValue(portfolio: Portfolio | undefined): UsePortfolioValueReturn {
  const { baseCurrency } = getPreferenceValues<ExtensionPreferences>();

  const [prices, setPrices] = useState<Map<string, CachedPrice>>(new Map());
  const [fxRates, setFxRates] = useState<Map<string, CachedFxRate>>(new Map());
  const [hpiData, setHpiData] = useState<Map<string, PropertyPriceChange>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<PortfolioError[]>([]);

  // Track fetch generation to discard stale responses
  const fetchGenRef = useRef(0);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ── Extract unique symbols, currencies, and property positions from the portfolio ──

  const { symbols, currencies, propertyPositions } = useMemo(() => {
    if (!portfolio || portfolio.accounts.length === 0) {
      return {
        symbols: [] as string[],
        currencies: [] as string[],
        propertyPositions: [] as Position[],
      };
    }

    const symbolSet = new Set<string>();
    const currencySet = new Set<string>();
    const propPositions: Position[] = [];

    for (const account of portfolio.accounts) {
      for (const position of account.positions) {
        // CASH positions don't have a tradeable symbol — skip them from API fetches.
        // Their price is always 1.0 per unit of their currency.
        // MORTGAGE / OWNED_PROPERTY positions use HPI data, not Yahoo Finance.
        if (position.assetType === AssetType.CASH || isPropertyAssetType(position.assetType)) {
          // Property positions are collected separately for HPI fetching
          if (isPropertyAssetType(position.assetType) && position.mortgageData) {
            propPositions.push(position);
          }
        } else {
          symbolSet.add(position.symbol);
        }
        currencySet.add(position.currency);
      }
    }

    return {
      symbols: [...symbolSet],
      currencies: [...currencySet],
      propertyPositions: propPositions,
    };
  }, [portfolio]);

  // ── Core fetch function ──

  const fetchData = useCallback(async () => {
    // Even if there are no tradeable symbols, we may still have property positions
    // or currencies that need FX rates. Only skip entirely if truly empty.
    const hasTradeableSymbols = symbols.length > 0;
    const hasPropertyPositions = propertyPositions.length > 0;
    const hasCurrencies = currencies.length > 0;

    if (!hasTradeableSymbols && !hasPropertyPositions && !hasCurrencies) {
      setPrices(new Map());
      setFxRates(new Map());
      setHpiData(new Map());
      setErrors([]);
      setIsLoading(false);
      return;
    }

    const gen = ++fetchGenRef.current;
    setIsLoading(true);
    setErrors([]);

    try {
      // Build parallel fetch tasks
      const tasks: Promise<unknown>[] = [];

      // Task 0: Prices (only if we have tradeable symbols)
      const priceTask = hasTradeableSymbols
        ? getCachedPrices(symbols)
        : Promise.resolve({
            prices: new Map<string, CachedPrice>(),
            errors: [] as Array<{ symbol: string; error: unknown }>,
          });
      tasks.push(priceTask);

      // Task 1: FX rates (always fetch if we have currencies)
      const fxTask = hasCurrencies
        ? getCachedFxRates(currencies, baseCurrency)
        : Promise.resolve(new Map<string, CachedFxRate>());
      tasks.push(fxTask);

      // Task 2: HPI data for property positions (deduplicated by postcode+valuationDate)
      const hpiTask = fetchPropertyHPIData(propertyPositions);
      tasks.push(hpiTask);

      const [priceResult, fxResult, hpiResult] = (await Promise.all(tasks)) as [
        { prices: Map<string, CachedPrice>; errors: Array<{ symbol: string; error: unknown }> },
        Map<string, CachedFxRate>,
        Map<string, PropertyPriceChange>,
      ];

      // Discard if a newer fetch has started
      if (!isMountedRef.current || gen !== fetchGenRef.current) return;

      setPrices(priceResult.prices);
      setFxRates(fxResult);
      setHpiData(hpiResult);

      // Collect errors from price fetches
      const fetchErrors: PortfolioError[] = priceResult.errors.map(({ symbol, error }) =>
        createPortfolioError(error, symbol),
      );

      setErrors(fetchErrors);
    } catch (err) {
      if (!isMountedRef.current || gen !== fetchGenRef.current) return;
      setErrors([createPortfolioError(err)]);
    } finally {
      if (isMountedRef.current && gen === fetchGenRef.current) {
        setIsLoading(false);
      }
    }
  }, [symbols, currencies, propertyPositions, baseCurrency]);

  // ── Trigger fetch when dependencies change ──

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Compute valuation from prices + FX rates + HPI data ──

  const valuation = useMemo((): PortfolioValuation | undefined => {
    if (!portfolio) return undefined;

    // We can compute a partial valuation even if some prices are missing.
    // Positions without prices will show as zero value.
    const accountValuations: AccountValuation[] = portfolio.accounts.map((account) => {
      const positionValuations: PositionValuation[] = account.positions.map((position) => {
        const fxData = fxRates.get(position.currency);
        const fxRate = fxData?.rate ?? 1.0;

        // ── CASH positions: price is always 1.0, no daily change, value = units directly.
        if (position.assetType === AssetType.CASH) {
          const totalNativeValue = position.units; // 1 unit of cash = 1 currency unit
          const totalBaseValue = totalNativeValue * fxRate;

          return {
            position,
            currentPrice: 1.0,
            totalNativeValue,
            totalBaseValue,
            change: 0,
            changePercent: 0,
            fxRate,
          };
        }

        // ── PROPERTY positions (MORTGAGE / OWNED_PROPERTY): valued via HPI + mortgage calculator
        if (isPropertyAssetType(position.assetType) && position.mortgageData) {
          const hpiKey = propertyHPIKey(position);
          const hpi = hpiKey ? hpiData.get(hpiKey) : undefined;
          const hpiChangePercent = hpi?.changePercent ?? 0;

          // Calculate current equity using the mortgage calculator
          const equityCalc = calculateCurrentEquity(position.mortgageData, hpiChangePercent);

          // The "value" of a property position is the user's adjusted equity
          // (accounts for shared ownership split and reserved equity)
          const totalNativeValue = equityCalc.adjustedEquity;
          const totalBaseValue = totalNativeValue * fxRate;

          // "Change" represents the equity change since valuation.
          // HPI appreciation is applied to the FULL property value, then reflected
          // through to equity. The percentage shown is equity-relative, not raw HPI.
          const absoluteChange = equityCalc.adjustedEquity - equityCalc.originalEquity;
          const equityChangePercent =
            equityCalc.originalEquity > 0 ? (absoluteChange / equityCalc.originalEquity) * 100 : hpiChangePercent;

          return {
            position,
            currentPrice: equityCalc.adjustedEquity, // "price" = user's equity for display
            totalNativeValue,
            totalBaseValue,
            change: absoluteChange,
            changePercent: equityChangePercent,
            fxRate,
            hpiChangePercent, // raw HPI % for the detail panel
          };
        }

        // ── Regular (traded) positions: use fetched price data unless a manual override is set.
        const priceData = prices.get(position.symbol);
        const hasPriceOverride = typeof position.priceOverride === "number";
        const currentPrice = hasPriceOverride ? position.priceOverride! : (priceData?.price ?? 0);
        const totalNativeValue = position.units * currentPrice;
        const totalBaseValue = totalNativeValue * fxRate;
        const change = hasPriceOverride ? 0 : (priceData?.change ?? 0);
        const changePercent = hasPriceOverride ? 0 : (priceData?.changePercent ?? 0);

        return {
          position,
          currentPrice,
          totalNativeValue,
          totalBaseValue,
          change,
          changePercent,
          fxRate,
        };
      });

      const accountTotal = positionValuations.reduce((sum, pv) => sum + pv.totalBaseValue, 0);

      return {
        account,
        positions: positionValuations,
        totalBaseValue: accountTotal,
      };
    });

    const grandTotal = accountValuations.reduce((sum, av) => sum + av.totalBaseValue, 0);

    // Determine the most recent fetch timestamp across all prices
    let latestFetch = "";
    for (const price of prices.values()) {
      if (price.fetchedAt > latestFetch) {
        latestFetch = price.fetchedAt;
      }
    }
    // Also consider HPI fetch timestamps
    for (const hpi of hpiData.values()) {
      if (hpi.fetchedAt > latestFetch) {
        latestFetch = hpi.fetchedAt;
      }
    }

    return {
      accounts: accountValuations,
      totalValue: grandTotal,
      baseCurrency,
      lastUpdated: latestFetch || new Date().toISOString(),
    };
  }, [portfolio, prices, fxRates, hpiData, baseCurrency]);

  // ── Refresh function ──

  const refresh = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return {
    valuation,
    isLoading,
    errors,
    baseCurrency,
    refresh,
  };
}

// ──────────────────────────────────────────
// Property HPI Batch Fetcher
// ──────────────────────────────────────────

/**
 * Fetches HPI data for all property positions, deduplicated by
 * postcode + valuation date. Returns a Map keyed by the HPI key
 * (postcode:valuationDate) for easy lookup during valuation.
 *
 * Errors for individual properties are logged but do not fail
 * the entire batch — properties without HPI data will show
 * their original equity without appreciation.
 *
 * @param positions - Array of property positions with mortgageData
 * @returns Map of HPI key → PropertyPriceChange
 */
async function fetchPropertyHPIData(positions: Position[]): Promise<Map<string, PropertyPriceChange>> {
  const result = new Map<string, PropertyPriceChange>();

  if (positions.length === 0) return result;

  // Deduplicate by HPI key (postcode + valuation date)
  const uniqueKeys = new Map<string, { postcode: string; valuationDate: string }>();

  for (const position of positions) {
    const key = propertyHPIKey(position);
    if (key && !uniqueKeys.has(key)) {
      uniqueKeys.set(key, {
        postcode: position.mortgageData!.postcode,
        valuationDate: position.mortgageData!.valuationDate,
      });
    }
  }

  // First, try sync cache for instant results
  const uncachedKeys: Array<{ key: string; postcode: string; valuationDate: string }> = [];

  for (const [key, { postcode, valuationDate }] of uniqueKeys) {
    const cached = getPropertyPriceChangeSync(postcode, valuationDate);
    if (cached) {
      result.set(key, cached);
    } else {
      uncachedKeys.push({ key, postcode, valuationDate });
    }
  }

  // Fetch uncached HPI data in parallel
  if (uncachedKeys.length > 0) {
    const fetches = uncachedKeys.map(async ({ key, postcode, valuationDate }) => {
      try {
        const change = await getPropertyPriceChange(postcode, valuationDate);
        return { key, change, error: null };
      } catch (error) {
        console.error(`Failed to fetch HPI for postcode ${postcode}:`, error);
        return { key, change: null, error };
      }
    });

    const results = await Promise.all(fetches);

    for (const { key, change } of results) {
      if (change) {
        result.set(key, change);
      }
      // Properties with failed HPI lookups will use 0% change (original equity only)
    }
  }

  return result;
}

// ──────────────────────────────────────────
// Utility: Check if valuation has any data
// ──────────────────────────────────────────

/**
 * Checks whether a portfolio valuation has any priced positions.
 * Useful for determining whether to show the "empty" vs "loaded" state.
 *
 * @param valuation - The computed portfolio valuation
 * @returns true if at least one position has a non-zero price
 */
export function hasAnyPricedPositions(valuation: PortfolioValuation | undefined): boolean {
  if (!valuation) return false;

  return valuation.accounts.some((av) => av.positions.some((pv) => pv.currentPrice > 0));
}

/**
 * Checks whether all errors in the list are offline errors.
 * If true, the UI should show the "Offline" indicator rather than
 * individual error messages.
 *
 * @param errors - Array of portfolio errors
 * @returns true if all errors are offline/transient
 */
export function areAllErrorsOffline(errors: PortfolioError[]): boolean {
  if (errors.length === 0) return false;
  return errors.every((e) => e.type === ErrorType.OFFLINE);
}
