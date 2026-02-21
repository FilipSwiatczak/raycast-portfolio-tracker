/**
 * PortfolioList component.
 *
 * The main portfolio overview view that composes accounts, positions, and actions
 * into a single Raycast List. This is the primary view users see when they open
 * the "Portfolio Tracker" command.
 *
 * Structure:
 * - A `List` with `isShowingDetail={true}` for a split-pane layout
 * - Account totals displayed in the navigation title / search bar area
 * - One `List.Section` per account, with the account name and total as title/subtitle
 * - Each position rendered as a `PositionListItem` within its account section
 * - Empty state handled by `EmptyPortfolio` component
 * - All actions composed in a layered ActionPanel:
 *     1. PositionActions (when a position is selected)
 *     2. AccountActions (for the parent account of the selected position)
 *     3. PortfolioActions (always available)
 *
 * Data flow:
 * - Receives portfolio data from `usePortfolio` hook (passed as props)
 * - Receives valuation data from `usePortfolioValue` hook (passed as props)
 * - Delegates all mutations back to the parent via callbacks
 * - Does NOT call hooks directly — purely a rendering component
 *
 * This separation means the component can be iterated on visually without
 * touching any data-fetching or mutation logic.
 *
 * Usage:
 * ```tsx
 * // In portfolio.tsx (the command entry point):
 * <PortfolioList
 *   portfolio={portfolio}
 *   valuation={valuation}
 *   isLoading={isLoading}
 *   errors={errors}
 *   onAddAccount={handleAddAccount}
 *   onEditAccount={handleEditAccount}
 *   onDeleteAccount={handleDeleteAccount}
 *   onAddPosition={handleAddPosition}
 *   onEditPosition={handleEditPosition}
 *   onDeletePosition={handleDeletePosition}
 *   onRefresh={handleRefresh}
 *   onSearchInvestments={handleSearch}
 * />
 * ```
 */

import React from "react";
import { ActionPanel, Color, Icon, List } from "@raycast/api";
import {
  Portfolio,
  PortfolioValuation,
  AccountValuation,
  Account,
  Position,
  PortfolioError,
  ErrorType,
} from "../utils/types";
import { formatCurrency, formatCurrencyCompact, formatRelativeTime } from "../utils/formatting";

import { EmptyPortfolio } from "./EmptyPortfolio";
import { PositionListItem } from "./PositionListItem";
import { PortfolioActions } from "./actions/PortfolioActions";
import { AccountActions } from "./actions/AccountActions";
import { PositionActions } from "./actions/PositionActions";

// ──────────────────────────────────────────
// Props
// ──────────────────────────────────────────

export interface PortfolioListProps {
  /** The current portfolio state */
  portfolio: Portfolio | undefined;

  /** The computed portfolio valuation (prices + FX applied) */
  valuation: PortfolioValuation | undefined;

  /** Whether data is currently loading (prices, FX, or portfolio) */
  isLoading: boolean;

  /** Array of errors from price/FX fetching */
  errors: PortfolioError[];

  // ── Callbacks (mutations delegated to the parent) ──

  /** Navigate to the "Add Account" form */
  onAddAccount: () => void;

  /** Navigate to the "Edit Account" form for a specific account */
  onEditAccount: (account: Account) => void;

  /** Delete an account (parent handles confirmation if needed) */
  onDeleteAccount: (accountId: string) => Promise<void>;

  /** Navigate to the "Search Investments" / "Add Position" flow for an account */
  onAddPosition: (accountId: string) => void;

  /** Navigate to the "Edit Position" form for a specific position */
  onEditPosition: (account: Account, position: Position) => void;

  /** Delete a position (parent handles confirmation if needed) */
  onDeletePosition: (accountId: string, positionId: string) => Promise<void>;

  /** Refresh all prices and FX rates */
  onRefresh: () => void;

  /** Navigate to the standalone "Search Investments" command */
  onSearchInvestments?: () => void;
}

// ──────────────────────────────────────────
// Component
// ──────────────────────────────────────────

export function PortfolioList({
  portfolio,
  valuation,
  isLoading,
  errors,
  onAddAccount,
  onEditAccount,
  onDeleteAccount,
  onAddPosition,
  onEditPosition,
  onDeletePosition,
  onRefresh,
  onSearchInvestments,
}: PortfolioListProps): React.JSX.Element {
  const hasAccounts = (portfolio?.accounts.length ?? 0) > 0;
  const hasPositions = portfolio?.accounts.some((a) => a.positions.length > 0) ?? false;

  // ── Navigation Title ──
  // Shows total portfolio value in the title bar for quick reference

  const navTitle = buildNavigationTitle(valuation, isLoading);

  // ── Offline / Error Indicator ──

  const isOffline = errors.length > 0 && errors.every((e) => e.type === ErrorType.OFFLINE);
  const hasApiErrors = errors.some((e) => e.type === ErrorType.API_ERROR);

  // ── Search Bar Placeholder ──

  const searchPlaceholder = hasAccounts ? "Filter accounts and positions..." : "Portfolio Tracker";

  // ── Render ──

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={hasPositions}
      navigationTitle={navTitle}
      searchBarPlaceholder={searchPlaceholder}
    >
      {/* ── Empty State ── */}
      {!isLoading && !hasAccounts && <EmptyPortfolio onAddAccount={onAddAccount} />}

      {/* ── Offline Banner ── */}
      {isOffline && (
        <List.Section title="⚠️ Offline">
          <List.Item
            icon={{ source: Icon.WifiDisabled, tintColor: Color.Orange }}
            title="Unable to fetch latest prices"
            subtitle="Showing cached data. Will retry automatically."
            actions={
              <ActionPanel>
                <PortfolioActions
                  onAddAccount={onAddAccount}
                  onRefresh={onRefresh}
                  onSearchInvestments={hasAccounts ? onSearchInvestments : undefined}
                />
              </ActionPanel>
            }
          />
        </List.Section>
      )}

      {/* ── API Error Banner ── */}
      {hasApiErrors && !isOffline && (
        <List.Section title="⚠️ Errors">
          {errors
            .filter((e) => e.type === ErrorType.API_ERROR)
            .map((error, index) => (
              <List.Item
                key={`error-${index}`}
                icon={{ source: Icon.ExclamationMark, tintColor: Color.Red }}
                title={error.symbol ? `Error fetching ${error.symbol}` : "API Error"}
                subtitle={error.message}
                accessories={[
                  {
                    text: formatRelativeTime(error.timestamp),
                    tooltip: error.timestamp,
                  },
                ]}
                actions={
                  <ActionPanel>
                    <PortfolioActions
                      onAddAccount={onAddAccount}
                      onRefresh={onRefresh}
                      onSearchInvestments={hasAccounts ? onSearchInvestments : undefined}
                    />
                  </ActionPanel>
                }
              />
            ))}
        </List.Section>
      )}

      {/* ── Account Sections ── */}
      {valuation?.accounts.map((accountVal) => (
        <AccountSection
          key={accountVal.account.id}
          accountValuation={accountVal}
          baseCurrency={valuation.baseCurrency}
          onAddAccount={onAddAccount}
          onEditAccount={onEditAccount}
          onDeleteAccount={onDeleteAccount}
          onAddPosition={onAddPosition}
          onEditPosition={onEditPosition}
          onDeletePosition={onDeletePosition}
          onRefresh={onRefresh}
          onSearchInvestments={onSearchInvestments}
        />
      ))}

      {/* ── Accounts Without Valuation (fallback if valuation hasn't loaded yet) ── */}
      {!valuation &&
        portfolio?.accounts.map((account) => (
          <List.Section
            key={account.id}
            title={account.name}
            subtitle={`${account.positions.length} position${account.positions.length === 1 ? "" : "s"}`}
          >
            {account.positions.length === 0 ? (
              <List.Item
                icon={Icon.PlusCircle}
                title="Add your first position"
                subtitle="Search for stocks, ETFs, or funds"
                actions={
                  <ActionPanel>
                    <AccountActions
                      account={account}
                      onAddPosition={() => onAddPosition(account.id)}
                      onEditAccount={() => onEditAccount(account)}
                      onDeleteAccount={() => onDeleteAccount(account.id)}
                    />
                    <PortfolioActions
                      onAddAccount={onAddAccount}
                      onRefresh={onRefresh}
                      onSearchInvestments={onSearchInvestments}
                    />
                  </ActionPanel>
                }
              />
            ) : (
              account.positions.map((position) => (
                <List.Item
                  key={position.id}
                  icon={Icon.CircleProgress}
                  title={position.name}
                  subtitle={`${position.symbol} · Loading...`}
                  actions={
                    <ActionPanel>
                      <PositionActions
                        position={position}
                        accountId={account.id}
                        onEditPosition={() => onEditPosition(account, position)}
                        onDeletePosition={() => onDeletePosition(account.id, position.id)}
                      />
                      <AccountActions
                        account={account}
                        onAddPosition={() => onAddPosition(account.id)}
                        onEditAccount={() => onEditAccount(account)}
                        onDeleteAccount={() => onDeleteAccount(account.id)}
                      />
                      <PortfolioActions
                        onAddAccount={onAddAccount}
                        onRefresh={onRefresh}
                        onSearchInvestments={onSearchInvestments}
                      />
                    </ActionPanel>
                  }
                />
              ))
            )}
          </List.Section>
        ))}
    </List>
  );
}

// ──────────────────────────────────────────
// AccountSection Sub-Component
// ──────────────────────────────────────────

/**
 * Renders a single account as a List.Section containing its positions.
 *
 * Section title: account name
 * Section subtitle: total value in base currency
 *
 * If the account has no positions, shows a prompt to add the first one.
 */

interface AccountSectionProps {
  accountValuation: AccountValuation;
  baseCurrency: string;
  onAddAccount: () => void;
  onEditAccount: (account: Account) => void;
  onDeleteAccount: (accountId: string) => Promise<void>;
  onAddPosition: (accountId: string) => void;
  onEditPosition: (account: Account, position: Position) => void;
  onDeletePosition: (accountId: string, positionId: string) => Promise<void>;
  onRefresh: () => void;
  onSearchInvestments?: () => void;
}

function AccountSection({
  accountValuation,
  baseCurrency,
  onAddAccount,
  onEditAccount,
  onDeleteAccount,
  onAddPosition,
  onEditPosition,
  onDeletePosition,
  onRefresh,
  onSearchInvestments,
}: AccountSectionProps): React.JSX.Element {
  const { account, positions, totalBaseValue } = accountValuation;

  // Section subtitle: account total + position count
  const positionCount = positions.length;
  const sectionSubtitle =
    positionCount > 0
      ? `${formatCurrencyCompact(totalBaseValue, baseCurrency)} · ${positionCount} position${positionCount === 1 ? "" : "s"}`
      : "No positions";

  return (
    <List.Section title={account.name} subtitle={sectionSubtitle}>
      {/* ── Empty Account Prompt ── */}
      {positionCount === 0 && (
        <List.Item
          icon={Icon.PlusCircle}
          title="Add your first position"
          subtitle="Search for stocks, ETFs, or funds"
          actions={
            <ActionPanel>
              <AccountActions
                account={account}
                onAddPosition={() => onAddPosition(account.id)}
                onEditAccount={() => onEditAccount(account)}
                onDeleteAccount={() => onDeleteAccount(account.id)}
              />
              <PortfolioActions
                onAddAccount={onAddAccount}
                onRefresh={onRefresh}
                onSearchInvestments={onSearchInvestments}
              />
            </ActionPanel>
          }
        />
      )}

      {/* ── Position Items ── */}
      {positions.map((positionVal) => (
        <PositionListItem
          key={positionVal.position.id}
          valuation={positionVal}
          baseCurrency={baseCurrency}
          actions={
            <ActionPanel>
              <PositionActions
                position={positionVal.position}
                accountId={account.id}
                onEditPosition={() => onEditPosition(account, positionVal.position)}
                onDeletePosition={() => onDeletePosition(account.id, positionVal.position.id)}
              />
              <AccountActions
                account={account}
                onAddPosition={() => onAddPosition(account.id)}
                onEditAccount={() => onEditAccount(account)}
                onDeleteAccount={() => onDeleteAccount(account.id)}
              />
              <PortfolioActions
                onAddAccount={onAddAccount}
                onRefresh={onRefresh}
                onSearchInvestments={onSearchInvestments}
              />
            </ActionPanel>
          }
        />
      ))}
    </List.Section>
  );
}

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────

/**
 * Builds the navigation title string showing total portfolio value.
 *
 * Examples:
 * - Loading: "Portfolio Tracker"
 * - With data: "Portfolio Tracker — £142,350.00"
 * - Empty: "Portfolio Tracker — £0.00"
 */
function buildNavigationTitle(valuation: PortfolioValuation | undefined, isLoading: boolean): string {
  const base = "Portfolio Tracker";

  if (isLoading && !valuation) {
    return base;
  }

  if (!valuation || valuation.accounts.length === 0) {
    return base;
  }

  const totalFormatted = formatCurrency(valuation.totalValue, valuation.baseCurrency);

  return `${base} — ${totalFormatted}`;
}
