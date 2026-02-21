/**
 * PortfolioActions component.
 *
 * Top-level action panel displayed when the user is in the portfolio overview.
 * Provides actions that apply to the portfolio as a whole, such as adding
 * a new account or refreshing all prices.
 *
 * These actions are rendered at the top of the ActionPanel in the portfolio
 * list view, above any account-specific or position-specific actions.
 *
 * Usage:
 * ```tsx
 * <ActionPanel>
 *   <PortfolioActions
 *     onAddAccount={() => push(<AccountForm onSubmit={...} />)}
 *     onRefresh={() => refresh()}
 *   />
 * </ActionPanel>
 * ```
 */

import React from "react";
import { Action, ActionPanel, Icon } from "@raycast/api";

// ──────────────────────────────────────────
// Props
// ──────────────────────────────────────────

interface PortfolioActionsProps {
  /** Callback to navigate to the "Add Account" form */
  onAddAccount: () => void;

  /** Callback to refresh all prices and FX rates */
  onRefresh: () => void;

  /**
   * Callback to navigate to the "Search Investments" view.
   * Only shown when there is at least one account to add positions to.
   */
  onSearchInvestments?: () => void;
}

// ──────────────────────────────────────────
// Component
// ──────────────────────────────────────────

/**
 * Top-level portfolio actions rendered in an ActionPanel.Section.
 *
 * Actions:
 * 1. Add Account — navigates to the AccountForm in create mode
 * 2. Search Investments — navigates to the search view (if accounts exist)
 * 3. Refresh Prices — re-fetches all prices and FX rates, clearing daily cache
 *
 * Keyboard shortcuts:
 * - ⌘N → Add Account
 * - ⌘F → Search Investments
 * - ⌘R → Refresh Prices
 */
export function PortfolioActions({
  onAddAccount,
  onRefresh,
  onSearchInvestments,
}: PortfolioActionsProps): React.JSX.Element {
  return (
    <>
      <ActionPanel.Section title="Portfolio">
        <Action
          title="Add Account"
          icon={Icon.PlusCircle}
          shortcut={{ modifiers: ["cmd"], key: "n" }}
          onAction={onAddAccount}
        />

        {onSearchInvestments && (
          <Action
            title="Search Investments"
            icon={Icon.MagnifyingGlass}
            shortcut={{ modifiers: ["cmd"], key: "f" }}
            onAction={onSearchInvestments}
          />
        )}

        <Action
          title="Refresh Prices"
          icon={Icon.ArrowClockwise}
          shortcut={{ modifiers: ["cmd"], key: "r" }}
          onAction={onRefresh}
        />
      </ActionPanel.Section>
    </>
  );
}
