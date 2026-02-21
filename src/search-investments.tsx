/**
 * Search Investments command — standalone entry point for searching securities.
 *
 * This command provides a standalone search experience accessible directly
 * from Raycast's root search. It wraps the SearchInvestmentsView component
 * and connects it to the portfolio hooks for adding positions.
 *
 * When the user has accounts, selecting a search result navigates to the
 * asset confirmation form where they can choose an account and specify units.
 * When no accounts exist, it operates in browse-only mode with a prompt
 * to create an account first.
 *
 * This is intentionally thin — all logic lives in hooks and components.
 */

import React from "react";
import { useNavigation, showToast, Toast } from "@raycast/api";
import { usePortfolio } from "./hooks/usePortfolio";
import { SearchInvestmentsView } from "./components/SearchInvestmentsView";
import { AssetType } from "./utils/types";

// ──────────────────────────────────────────
// Command Component
// ──────────────────────────────────────────

export default function SearchInvestmentsCommand(): React.JSX.Element {
  useNavigation();

  const { portfolio, isLoading, addPosition } = usePortfolio();

  const accounts = portfolio?.accounts ?? [];
  const hasAccounts = accounts.length > 0;

  // ── Determine Target Account ──
  // If the user has exactly one account, use it directly.
  // If multiple accounts exist, default to the first one.
  // A future enhancement could add an account picker dropdown in the search bar.

  const targetAccount = hasAccounts ? accounts[0] : undefined;

  // ── Handlers ──

  async function handleConfirm(params: {
    symbol: string;
    name: string;
    units: number;
    currency: string;
    assetType: AssetType;
  }): Promise<void> {
    if (!targetAccount) {
      await showToast({
        style: Toast.Style.Failure,
        title: "No Account",
        message: "Please create an account first before adding positions.",
      });
      return;
    }

    await addPosition(targetAccount.id, params);
  }

  // ── Render ──

  // If no accounts exist, we could show the search in browse-only mode
  // and prompt the user to create an account. For now, we still show the
  // search view but without the ability to add positions.

  if (!hasAccounts && !isLoading) {
    return <SearchInvestmentsView />;
  }

  return (
    <SearchInvestmentsView accountId={targetAccount?.id} accountName={targetAccount?.name} onConfirm={handleConfirm} />
  );
}
