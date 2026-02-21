/**
 * React hook for portfolio CRUD operations via LocalStorage.
 *
 * This is the central state management hook for the entire extension.
 * All components that need to read or modify portfolio data should use this hook.
 *
 * Responsibilities:
 * - Loads portfolio from LocalStorage on mount
 * - Provides the current portfolio state to consumers
 * - Exposes mutation functions for accounts and positions
 * - Handles loading and error states
 * - Ensures all mutations are persisted immediately
 *
 * Design:
 * - Uses `useCachedPromise` from @raycast/utils for async loading with caching
 * - All mutation functions follow the pattern: update state → persist → revalidate
 * - Mutations are optimistic: the UI updates immediately, then persists in background
 * - Each mutation returns the updated portfolio for chaining if needed
 */

import { useCallback } from "react";
import { showToast, Toast } from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { Portfolio, Account, Position, AccountType, AssetType } from "../utils/types";
import { loadPortfolio, savePortfolio } from "../utils/storage";
import { generateId } from "../utils/uuid";

// ──────────────────────────────────────────
// Return Type
// ──────────────────────────────────────────

export interface UsePortfolioReturn {
  /** Current portfolio state (undefined while loading) */
  portfolio: Portfolio | undefined;

  /** Whether the initial load is in progress */
  isLoading: boolean;

  /** Force a reload from LocalStorage */
  revalidate: () => void;

  // ── Account Mutations ──

  /** Creates a new account and adds it to the portfolio */
  addAccount: (name: string, type: AccountType) => Promise<Account>;

  /** Updates an existing account's name and/or type */
  updateAccount: (accountId: string, updates: { name?: string; type?: AccountType }) => Promise<void>;

  /** Removes an account and all its positions */
  removeAccount: (accountId: string) => Promise<void>;

  // ── Position Mutations ──

  /** Adds a new position to a specific account */
  addPosition: (
    accountId: string,
    params: {
      symbol: string;
      name: string;
      units: number;
      currency: string;
      assetType: AssetType;
    },
  ) => Promise<Position>;

  /** Updates the units of an existing position */
  updatePosition: (accountId: string, positionId: string, units: number) => Promise<void>;

  /** Removes a position from an account */
  removePosition: (accountId: string, positionId: string) => Promise<void>;

  // ── Bulk Operations ──

  /** Returns a flat array of all positions across all accounts */
  getAllPositions: () => Position[];

  /** Returns all unique symbols in the portfolio */
  getAllSymbols: () => string[];

  /** Returns all unique currencies held in the portfolio */
  getAllCurrencies: () => string[];

  /** Finds an account by ID */
  getAccount: (accountId: string) => Account | undefined;
}

// ──────────────────────────────────────────
// Hook Implementation
// ──────────────────────────────────────────

export function usePortfolio(): UsePortfolioReturn {
  const {
    data: portfolio,
    isLoading,
    revalidate,
    mutate,
  } = useCachedPromise(loadPortfolio, [], {
    // Keep previous data while revalidating to avoid UI flicker
    keepPreviousData: true,
  });

  // ── Account Mutations ──────────────────

  const addAccount = useCallback(
    async (name: string, type: AccountType): Promise<Account> => {
      const newAccount: Account = {
        id: generateId(),
        name: name.trim(),
        type,
        createdAt: new Date().toISOString(),
        positions: [],
      };

      await mutate(
        (async () => {
          const current = portfolio ?? (await loadPortfolio());
          const updated: Portfolio = {
            ...current,
            accounts: [...current.accounts, newAccount],
            updatedAt: new Date().toISOString(),
          };
          await savePortfolio(updated);
          return updated;
        })(),
        {
          optimisticUpdate(currentData) {
            if (!currentData) return currentData;
            return {
              ...currentData,
              accounts: [...currentData.accounts, newAccount],
              updatedAt: new Date().toISOString(),
            };
          },
        },
      );

      await showToast({
        style: Toast.Style.Success,
        title: "Account Created",
        message: name.trim(),
      });

      return newAccount;
    },
    [portfolio, mutate],
  );

  const updateAccount = useCallback(
    async (accountId: string, updates: { name?: string; type?: AccountType }): Promise<void> => {
      await mutate(
        (async () => {
          const current = portfolio ?? (await loadPortfolio());
          const updated: Portfolio = {
            ...current,
            accounts: current.accounts.map((account) =>
              account.id === accountId
                ? {
                    ...account,
                    ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
                    ...(updates.type !== undefined ? { type: updates.type } : {}),
                  }
                : account,
            ),
            updatedAt: new Date().toISOString(),
          };
          await savePortfolio(updated);
          return updated;
        })(),
        {
          optimisticUpdate(currentData) {
            if (!currentData) return currentData;
            return {
              ...currentData,
              accounts: currentData.accounts.map((account) =>
                account.id === accountId
                  ? {
                      ...account,
                      ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
                      ...(updates.type !== undefined ? { type: updates.type } : {}),
                    }
                  : account,
              ),
              updatedAt: new Date().toISOString(),
            };
          },
        },
      );

      await showToast({
        style: Toast.Style.Success,
        title: "Account Updated",
      });
    },
    [portfolio, mutate],
  );

  const removeAccount = useCallback(
    async (accountId: string): Promise<void> => {
      const account = portfolio?.accounts.find((a) => a.id === accountId);
      const accountName = account?.name ?? "Account";

      await mutate(
        (async () => {
          const current = portfolio ?? (await loadPortfolio());
          const updated: Portfolio = {
            ...current,
            accounts: current.accounts.filter((a) => a.id !== accountId),
            updatedAt: new Date().toISOString(),
          };
          await savePortfolio(updated);
          return updated;
        })(),
        {
          optimisticUpdate(currentData) {
            if (!currentData) return currentData;
            return {
              ...currentData,
              accounts: currentData.accounts.filter((a) => a.id !== accountId),
              updatedAt: new Date().toISOString(),
            };
          },
        },
      );

      await showToast({
        style: Toast.Style.Success,
        title: "Account Removed",
        message: accountName,
      });
    },
    [portfolio, mutate],
  );

  // ── Position Mutations ─────────────────

  const addPosition = useCallback(
    async (
      accountId: string,
      params: {
        symbol: string;
        name: string;
        units: number;
        currency: string;
        assetType: AssetType;
      },
    ): Promise<Position> => {
      const newPosition: Position = {
        id: generateId(),
        symbol: params.symbol,
        name: params.name,
        units: params.units,
        currency: params.currency,
        assetType: params.assetType,
        addedAt: new Date().toISOString(),
      };

      await mutate(
        (async () => {
          const current = portfolio ?? (await loadPortfolio());
          const updated: Portfolio = {
            ...current,
            accounts: current.accounts.map((account) =>
              account.id === accountId ? { ...account, positions: [...account.positions, newPosition] } : account,
            ),
            updatedAt: new Date().toISOString(),
          };
          await savePortfolio(updated);
          return updated;
        })(),
        {
          optimisticUpdate(currentData) {
            if (!currentData) return currentData;
            return {
              ...currentData,
              accounts: currentData.accounts.map((account) =>
                account.id === accountId ? { ...account, positions: [...account.positions, newPosition] } : account,
              ),
              updatedAt: new Date().toISOString(),
            };
          },
        },
      );

      await showToast({
        style: Toast.Style.Success,
        title: "Position Added",
        message: `${params.units} × ${params.name}`,
      });

      return newPosition;
    },
    [portfolio, mutate],
  );

  const updatePosition = useCallback(
    async (accountId: string, positionId: string, units: number): Promise<void> => {
      await mutate(
        (async () => {
          const current = portfolio ?? (await loadPortfolio());
          const updated: Portfolio = {
            ...current,
            accounts: current.accounts.map((account) =>
              account.id === accountId
                ? {
                    ...account,
                    positions: account.positions.map((pos) => (pos.id === positionId ? { ...pos, units } : pos)),
                  }
                : account,
            ),
            updatedAt: new Date().toISOString(),
          };
          await savePortfolio(updated);
          return updated;
        })(),
        {
          optimisticUpdate(currentData) {
            if (!currentData) return currentData;
            return {
              ...currentData,
              accounts: currentData.accounts.map((account) =>
                account.id === accountId
                  ? {
                      ...account,
                      positions: account.positions.map((pos) => (pos.id === positionId ? { ...pos, units } : pos)),
                    }
                  : account,
              ),
              updatedAt: new Date().toISOString(),
            };
          },
        },
      );

      await showToast({
        style: Toast.Style.Success,
        title: "Position Updated",
        message: `Units set to ${units}`,
      });
    },
    [portfolio, mutate],
  );

  const removePosition = useCallback(
    async (accountId: string, positionId: string): Promise<void> => {
      // Find the position name for the toast message
      const position = portfolio?.accounts.find((a) => a.id === accountId)?.positions.find((p) => p.id === positionId);
      const positionName = position?.name ?? "Position";

      await mutate(
        (async () => {
          const current = portfolio ?? (await loadPortfolio());
          const updated: Portfolio = {
            ...current,
            accounts: current.accounts.map((account) =>
              account.id === accountId
                ? {
                    ...account,
                    positions: account.positions.filter((p) => p.id !== positionId),
                  }
                : account,
            ),
            updatedAt: new Date().toISOString(),
          };
          await savePortfolio(updated);
          return updated;
        })(),
        {
          optimisticUpdate(currentData) {
            if (!currentData) return currentData;
            return {
              ...currentData,
              accounts: currentData.accounts.map((account) =>
                account.id === accountId
                  ? {
                      ...account,
                      positions: account.positions.filter((p) => p.id !== positionId),
                    }
                  : account,
              ),
              updatedAt: new Date().toISOString(),
            };
          },
        },
      );

      await showToast({
        style: Toast.Style.Success,
        title: "Position Removed",
        message: positionName,
      });
    },
    [portfolio, mutate],
  );

  // ── Query Helpers ──────────────────────

  const getAllPositions = useCallback((): Position[] => {
    if (!portfolio) return [];
    return portfolio.accounts.flatMap((account) => account.positions);
  }, [portfolio]);

  const getAllSymbols = useCallback((): string[] => {
    if (!portfolio) return [];
    const symbols = new Set<string>();
    for (const account of portfolio.accounts) {
      for (const position of account.positions) {
        symbols.add(position.symbol);
      }
    }
    return [...symbols];
  }, [portfolio]);

  const getAllCurrencies = useCallback((): string[] => {
    if (!portfolio) return [];
    const currencies = new Set<string>();
    for (const account of portfolio.accounts) {
      for (const position of account.positions) {
        currencies.add(position.currency);
      }
    }
    return [...currencies];
  }, [portfolio]);

  const getAccount = useCallback(
    (accountId: string): Account | undefined => {
      return portfolio?.accounts.find((a) => a.id === accountId);
    },
    [portfolio],
  );

  // ── Return ─────────────────────────────

  return {
    portfolio,
    isLoading,
    revalidate,

    addAccount,
    updateAccount,
    removeAccount,

    addPosition,
    updatePosition,
    removePosition,

    getAllPositions,
    getAllSymbols,
    getAllCurrencies,
    getAccount,
  };
}
