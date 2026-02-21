/**
 * EmptyPortfolio component.
 *
 * Displayed when the user has no accounts or positions in their portfolio.
 * Provides a friendly onboarding prompt with a clear call-to-action to
 * create their first investment account.
 *
 * This is the first thing a new user sees after setting their base currency
 * preference. It should feel welcoming and guide them to the next step.
 *
 * Usage:
 * ```tsx
 * <EmptyPortfolio onAddAccount={() => push(<AccountForm />)} />
 * ```
 */

import React from "react";
import { ActionPanel, Action, Icon, List } from "@raycast/api";

// ──────────────────────────────────────────
// Props
// ──────────────────────────────────────────

interface EmptyPortfolioProps {
  /** Callback fired when the user chooses to add their first account */
  onAddAccount: () => void;
}

// ──────────────────────────────────────────
// Component
// ──────────────────────────────────────────

/**
 * Empty state view shown when the portfolio has no accounts.
 *
 * Renders a `List.EmptyView` with an icon, title, description,
 * and an action to create the first account.
 */
export function EmptyPortfolio({ onAddAccount }: EmptyPortfolioProps): React.JSX.Element {
  return (
    <List.EmptyView
      icon={Icon.BarChart}
      title="Welcome to Portfolio Tracker"
      description="Add your first investment account to start tracking your net worth. You can create accounts for ISAs, SIPPs, brokerages, and more."
      actions={
        <ActionPanel>
          <Action title="Add Account" icon={Icon.PlusCircle} onAction={onAddAccount} />
        </ActionPanel>
      }
    />
  );
}
