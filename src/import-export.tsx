/**
 * Import/Export command — entry point for portfolio CSV import and export.
 *
 * This is a thin wiring layer that connects:
 * - `usePortfolio` hook (for reading current portfolio and merging imports)
 * - `usePortfolioValue` hook (for current valuations used in export)
 * - `ImportExportView` component (the main UI)
 *
 * Design principle: this file should contain NO rendering logic or business logic.
 * It only wires hooks to the component.
 */

import React from "react";
import { usePortfolio } from "./hooks/usePortfolio";
import { usePortfolioValue } from "./hooks/usePortfolioValue";
import { ImportExportView } from "./components/ImportExportView";

// ──────────────────────────────────────────
// Command Component
// ──────────────────────────────────────────

export default function ImportExportCommand(): React.JSX.Element {
  const { portfolio, isLoading: isPortfolioLoading, revalidate, mergeAccounts } = usePortfolio();

  const { valuation, isLoading: isValuationLoading, baseCurrency } = usePortfolioValue(portfolio);

  const isLoading = isPortfolioLoading || isValuationLoading;

  return (
    <ImportExportView
      portfolio={portfolio}
      valuation={valuation}
      baseCurrency={baseCurrency}
      isLoading={isLoading}
      onMergeAccounts={mergeAccounts}
      onRevalidate={revalidate}
    />
  );
}
