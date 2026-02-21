/**
 * Portfolio command — main entry point for the Portfolio Tracker extension.
 *
 * This is a thin wiring layer that connects:
 * - `usePortfolio` hook (CRUD operations on accounts/positions via LocalStorage)
 * - `usePortfolioValue` hook (live price fetching, FX conversion, valuation)
 * - `PortfolioList` component (the main UI)
 * - Navigation targets (AccountForm, EditPositionForm, search flow)
 *
 * It also updates the Raycast command metadata subtitle with the total portfolio
 * value so it's visible in the Raycast search bar at all times.
 *
 * Design principle: this file should contain NO rendering logic or business logic.
 * It only wires hooks to components and handles navigation pushes.
 */

import React from "react";
import { useEffect } from "react";
import { useNavigation, updateCommandMetadata } from "@raycast/api";
import { usePortfolio } from "./hooks/usePortfolio";
import { usePortfolioValue } from "./hooks/usePortfolioValue";
import { PortfolioList } from "./components/PortfolioList";
import { AccountForm } from "./components/AccountForm";
import { EditPositionForm } from "./components/EditPositionForm";
import { SearchInvestmentsView } from "./components/SearchInvestmentsView";
import { Account, Position, AccountType } from "./utils/types";
import { formatCurrency, formatCurrencyCompact } from "./utils/formatting";
import { clearPriceCache } from "./services/price-cache";

// ──────────────────────────────────────────
// Command Component
// ──────────────────────────────────────────

export default function PortfolioCommand(): React.JSX.Element {
  const { push } = useNavigation();

  // ── Data Hooks ──

  const {
    portfolio,
    isLoading: isPortfolioLoading,
    addAccount,
    updateAccount,
    removeAccount,
    addPosition,
    updatePosition,
    removePosition,
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

  function handleEditPosition(account: Account, position: Position): void {
    push(
      <EditPositionForm
        position={position}
        accountId={account.id}
        accountName={account.name}
        onSubmit={async (units: number) => {
          await updatePosition(account.id, position.id, units);
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
      onEditPosition={handleEditPosition}
      onDeletePosition={handleDeletePosition}
      onRefresh={handleRefresh}
      onSearchInvestments={(portfolio?.accounts.length ?? 0) > 0 ? handleSearchInvestments : undefined}
    />
  );
}
