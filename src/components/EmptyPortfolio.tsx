/**
 * EmptyPortfolio component.
 *
 * Displayed when the user has no accounts or positions in their portfolio.
 * Provides a friendly onboarding prompt with a clear call-to-action to
 * create their first investment account.
 *
 * Also offers a "See Sample Portfolio" option that loads a realistic
 * demo portfolio so new users can explore the extension's features
 * before adding their own data.
 *
 * Usage:
 * ```tsx
 * <EmptyPortfolio
 *   onAddAccount={() => push(<AccountForm />)}
 *   onLoadSample={() => loadSamplePortfolio()}
 * />
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

  /** Callback fired when the user chooses to load the sample portfolio */
  onLoadSample: () => void;
}

// ──────────────────────────────────────────
// Component
// ──────────────────────────────────────────

/**
 * Empty state view shown when the portfolio has no accounts.
 *
 * Renders a `List.EmptyView` with an icon, title, description,
 * and actions to either create the first account or preview
 * a sample portfolio.
 */
export function EmptyPortfolio({ onAddAccount, onLoadSample }: EmptyPortfolioProps): React.JSX.Element {
  return (
    <List.EmptyView
      icon={Icon.BarChart}
      title="Welcome to Portfolio Tracker"
      description="Add your first investment account to start tracking your net worth. You can create accounts for ISAs, SIPPs, brokerages, and more.\n\nOr preview with a sample portfolio to see how it works."
      actions={
        <ActionPanel>
          <Action title="Add Account" icon={Icon.PlusCircle} onAction={onAddAccount} />
          <Action
            title="See Sample Portfolio"
            icon={Icon.Eye}
            shortcut={{ modifiers: ["cmd"], key: "s" }}
            onAction={onLoadSample}
          />
        </ActionPanel>
      }
    />
  );
}
