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
 * 4. Compute per-position, per-account, and total valuations
 * 5. Expose loading, error, and refresh states
 *
 * Design:
 * - Composes `useAssetPrices` for price data and manages FX rates directly
 * - Memoises the valuation computation to avoid recalculating on every render
 * - Returns structured PortfolioValuation for direct consumption by UI components
 * - Handles partial failures gracefully (missing prices/FX rates don't crash the whole view)
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
} from "../utils/types";
import { getCachedPrices, getCachedFxRates } from "../services/price-cache";
import { createPortfolioError } from "../utils/errors";

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

  // ── Extract unique symbols and currencies from the portfolio ──

  const { symbols, currencies } = useMemo(() => {
    if (!portfolio || portfolio.accounts.length === 0) {
      return { symbols: [] as string[], currencies: [] as string[] };
    }

    const symbolSet = new Set<string>();
    const currencySet = new Set<string>();

    for (const account of portfolio.accounts) {
      for (const position of account.positions) {
        // CASH positions don't have a tradeable symbol — skip them from API fetches.
        // Their price is always 1.0 per unit of their currency.
        if (position.assetType !== AssetType.CASH) {
          symbolSet.add(position.symbol);
        }
        currencySet.add(position.currency);
      }
    }

    return {
      symbols: [...symbolSet],
      currencies: [...currencySet],
    };
  }, [portfolio]);

  // ── Core fetch function ──

  const fetchData = useCallback(async () => {
    if (symbols.length === 0) {
      setPrices(new Map());
      setFxRates(new Map());
      setErrors([]);
      setIsLoading(false);
      return;
    }

    const gen = ++fetchGenRef.current;
    setIsLoading(true);
    setErrors([]);

    try {
      // Fetch prices and FX rates in parallel
      const [priceResult, fxResult] = await Promise.all([
        getCachedPrices(symbols),
        getCachedFxRates(currencies, baseCurrency),
      ]);

      // Discard if a newer fetch has started
      if (!isMountedRef.current || gen !== fetchGenRef.current) return;

      setPrices(priceResult.prices);
      setFxRates(fxResult);

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
  }, [symbols, currencies, baseCurrency]);

  // ── Trigger fetch when dependencies change ──

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Compute valuation from prices + FX rates ──

  const valuation = useMemo((): PortfolioValuation | undefined => {
    if (!portfolio) return undefined;

    // We can compute a partial valuation even if some prices are missing.
    // Positions without prices will show as zero value.
    const accountValuations: AccountValuation[] = portfolio.accounts.map((account) => {
      const positionValuations: PositionValuation[] = account.positions.map((position) => {
        const fxData = fxRates.get(position.currency);
        const fxRate = fxData?.rate ?? 1.0;

        // CASH positions: price is always 1.0, no daily change, value = units directly.
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

        // Regular (traded) positions: use fetched price data unless a manual override is set.
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

    return {
      accounts: accountValuations,
      totalValue: grandTotal,
      baseCurrency,
      lastUpdated: latestFetch || new Date().toISOString(),
    };
  }, [portfolio, prices, fxRates, baseCurrency]);

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
