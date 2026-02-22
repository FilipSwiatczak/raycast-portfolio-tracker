/**
 * Portfolio command — main entry point for the Portfolio Tracker extension.
 *
 * This is a thin wiring layer that connects:
 * - `usePortfolio` hook (CRUD operations on accounts/positions via LocalStorage)
 * - `usePortfolioValue` hook (live price fetching, FX conversion, valuation)
 * - `PortfolioList` component (the main UI)
 * - Navigation targets (AccountForm, EditPositionForm, AddUnitsForm, search flow)
 *
 * It also updates the Raycast command metadata subtitle with the total portfolio
 * value so it's visible in the Raycast search bar at all times.
 *
 * Design principle: this file should contain NO rendering logic or business logic.
 * It only wires hooks to components and handles navigation pushes.
 */

import React from "react";
import { useEffect } from "react";
import { useNavigation, updateCommandMetadata, showToast, Toast } from "@raycast/api";
import { usePortfolio } from "./hooks/usePortfolio";
import { usePortfolioValue } from "./hooks/usePortfolioValue";
import { PortfolioList } from "./components/PortfolioList";
import { AccountForm } from "./components/AccountForm";
import { EditPositionForm } from "./components/EditPositionForm";
import { AddUnitsForm } from "./components/AddUnitsForm";
import { AddCashForm } from "./components/AddCashForm";
import { SearchInvestmentsView } from "./components/SearchInvestmentsView";
import { BatchRenameMatch } from "./components/BatchRenameForm";
import { Account, Position, AccountType } from "./utils/types";
import { formatCurrency, formatCurrencyCompact } from "./utils/formatting";
import { clearPriceCache } from "./services/price-cache";
import { SAMPLE_ACCOUNTS, isSampleAccount } from "./utils/sample-portfolio";

// ──────────────────────────────────────────
// Command Component
// ──────────────────────────────────────────

export default function PortfolioCommand(): React.JSX.Element {
  const { push, pop } = useNavigation();

  // ── Data Hooks ──

  const {
    portfolio,
    isLoading: isPortfolioLoading,
    revalidate: revalidatePortfolio,
    addAccount,
    updateAccount,
    removeAccount,
    addPosition,
    updatePosition,
    renamePosition,
    restorePositionName,
    batchRenamePositions,
    removePosition,
    mergeAccounts,
  } = usePortfolio();

  const {
    valuation,
    isLoading: isValuationLoading,
    errors,
    baseCurrency,
    refresh: refreshPrices,
  } = usePortfolioValue(portfolio);

  const isLoading = isPortfolioLoading || isValuationLoading;

  // ── Update Command Metadata ──
  // This sets the grey subtitle text visible in Raycast's search bar
  // next to the "Portfolio Tracker" command name.

  useEffect(() => {
    if (valuation && valuation.totalValue > 0) {
      const subtitle = formatCurrencyCompact(valuation.totalValue, valuation.baseCurrency);
      updateCommandMetadata({ subtitle });
    } else if (valuation && valuation.accounts.length > 0) {
      updateCommandMetadata({ subtitle: formatCurrency(0, baseCurrency) });
    }
  }, [valuation, baseCurrency]);

  // ── Navigation Handlers ──

  function handleAddAccount(): void {
    push(
      <AccountForm
        onSubmit={async (name: string, type: AccountType) => {
          await addAccount(name, type);
        }}
      />,
    );
  }

  function handleEditAccount(account: Account): void {
    push(
      <AccountForm
        account={account}
        onSubmit={async (name: string, type: AccountType) => {
          await updateAccount(account.id, { name, type });
        }}
      />,
    );
  }

  async function handleDeleteAccount(accountId: string): Promise<void> {
    await removeAccount(accountId);
  }

  function handleAddPosition(accountId: string): void {
    const account = portfolio?.accounts.find((a) => a.id === accountId);
    const accountName = account?.name ?? "Account";

    push(
      <SearchInvestmentsView
        accountId={accountId}
        accountName={accountName}
        onConfirm={async (params) => {
          await addPosition(accountId, params);
        }}
      />,
    );
  }

  /**
   * Finds all positions across the portfolio that share the same original
   * Yahoo Finance name, excluding a specific position (the one just renamed).
   */
  function findMatchingPositions(originalName: string, excludePositionId: string): BatchRenameMatch[] {
    if (!portfolio) return [];
    const matches: BatchRenameMatch[] = [];

    for (const acct of portfolio.accounts) {
      for (const pos of acct.positions) {
        if (pos.id !== excludePositionId && pos.name === originalName) {
          matches.push({
            accountId: acct.id,
            accountName: acct.name,
            position: pos,
          });
        }
      }
    }

    return matches;
  }

  function handleEditPosition(account: Account, position: Position): void {
    push(
      <EditPositionForm
        position={position}
        accountId={account.id}
        accountName={account.name}
        onSave={async (updates) => {
          // ── 1. Save changes to the ORIGINAL asset ──
          if (updates.unitsChanged) {
            await updatePosition(account.id, position.id, updates.units);
          }

          let didRename = false;
          if (updates.nameChanged) {
            if (updates.customName) {
              await renamePosition(account.id, position.id, updates.customName);
              didRename = true;
            } else {
              await restorePositionName(account.id, position.id);
            }
          }

          // ── 2. Return batch candidates (component handles phase transition) ──
          if (didRename && updates.customName) {
            return findMatchingPositions(position.name, position.id);
          }

          return [];
        }}
        onBatchApply={async (renames) => {
          await batchRenamePositions(renames);
        }}
        onRestoreName={async () => {
          await restorePositionName(account.id, position.id);
        }}
        onDone={() => {
          pop();
          revalidatePortfolio();
        }}
      />,
    );
  }

  function handleAddUnits(account: Account, position: Position): void {
    push(
      <AddUnitsForm
        position={position}
        accountId={account.id}
        accountName={account.name}
        onSubmit={async (newTotalUnits: number) => {
          await updatePosition(account.id, position.id, newTotalUnits);
        }}
      />,
    );
  }

  function handleAddCash(accountId: string): void {
    const account = portfolio?.accounts.find((a) => a.id === accountId);
    const accountName = account?.name ?? "Account";

    push(
      <AddCashForm
        accountId={accountId}
        accountName={accountName}
        onConfirm={async (params) => {
          await addPosition(accountId, params);
        }}
      />,
    );
  }

  async function handleDeletePosition(accountId: string, positionId: string): Promise<void> {
    await removePosition(accountId, positionId);
  }

  function handleRefresh(): void {
    clearPriceCache();
    refreshPrices();
  }

  function handleSearchInvestments(): void {
    // If there's only one account, go straight to search for that account.
    // If multiple accounts, show search with account selection (handled within SearchInvestmentsView).
    const accounts = portfolio?.accounts ?? [];

    if (accounts.length === 1) {
      handleAddPosition(accounts[0].id);
    } else if (accounts.length > 1) {
      // Push a search view that lets the user pick which account to add to.
      // For now, default to the first account — in a future iteration,
      // the SearchInvestmentsView could include an account picker dropdown.
      push(
        <SearchInvestmentsView
          accountId={accounts[0].id}
          accountName={accounts[0].name}
          onConfirm={async (params) => {
            await addPosition(accounts[0].id, params);
          }}
        />,
      );
    }
  }

  // ── Sample Portfolio Handlers ──

  async function handleLoadSample(): Promise<void> {
    try {
      // Merge the pre-built sample accounts (with their sample- prefixed IDs)
      // directly into the portfolio so isSampleAccount() detection works.
      await mergeAccounts(SAMPLE_ACCOUNTS);

      await showToast({
        style: Toast.Style.Success,
        title: "Sample Portfolio Loaded",
        message: "Explore the demo data, then hide it when you're ready.",
      });
    } catch (error) {
      console.error("Failed to load sample portfolio:", error);
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to Load Sample",
        message: String(error),
      });
    }
  }

  async function handleRemoveSample(): Promise<void> {
    try {
      const accounts = portfolio?.accounts ?? [];
      const sampleAccountIds = accounts.filter((a) => isSampleAccount(a.id)).map((a) => a.id);

      for (const accountId of sampleAccountIds) {
        await removeAccount(accountId);
      }

      await showToast({
        style: Toast.Style.Success,
        title: "Sample Portfolio Removed",
      });
    } catch (error) {
      console.error("Failed to remove sample portfolio:", error);
    }
  }

  // ── Render ──

  return (
    <PortfolioList
      portfolio={portfolio}
      valuation={valuation}
      isLoading={isLoading}
      errors={errors}
      onAddAccount={handleAddAccount}
      onEditAccount={handleEditAccount}
      onDeleteAccount={handleDeleteAccount}
      onAddPosition={handleAddPosition}
      onAddCash={handleAddCash}
      onEditPosition={handleEditPosition}
      onAddUnits={handleAddUnits}
      onDeletePosition={handleDeletePosition}
      onRefresh={handleRefresh}
      onSearchInvestments={(portfolio?.accounts.length ?? 0) > 0 ? handleSearchInvestments : undefined}
      onLoadSample={handleLoadSample}
      onRemoveSample={handleRemoveSample}
    />
  );
}
