/**
 * FIRE command — entry point for the Financial Independence, Retire Early dashboard.
 *
 * This is a thin wiring layer that connects:
 * - `useFireSettings` hook (FIRE configuration CRUD via LocalStorage)
 * - `usePortfolio` hook (read-only access to portfolio data)
 * - `usePortfolioValue` hook (live valuation for current portfolio total)
 * - `FireSetup` component (onboarding / edit settings form)
 * - `FireDashboard` component (projection chart + key metrics)
 *
 * Flow:
 * 1. Load FIRE settings and portfolio data in parallel
 * 2. If no FIRE settings exist → render FireSetup (onboarding)
 * 3. If settings exist → render FireDashboard (projections)
 * 4. Dashboard actions push FireSetup (edit) or FireContributions (manage)
 *
 * Design principle: this file contains NO rendering logic or business logic.
 * It only wires hooks to components and manages the setup → dashboard transition.
 *
 * The FIRE feature reads portfolio data but never modifies it. FIRE settings
 * are stored under a separate LocalStorage key (`fire-settings`).
 */

import React from "react";
import { useState, useCallback } from "react";
import { Detail } from "@raycast/api";
import { useFireSettings } from "./hooks/useFireSettings";
import { usePortfolio } from "./hooks/usePortfolio";
import { usePortfolioValue } from "./hooks/usePortfolioValue";
import { FireSetup } from "./components/FireSetup";
import { FireDashboard } from "./components/FireDashboard";
import { FireSettings, FireContribution } from "./utils/fire-types";

// ──────────────────────────────────────────
// Command Component
// ──────────────────────────────────────────

export default function FireCommand(): React.JSX.Element {
  // ── Data Hooks ──

  const {
    settings,
    isLoading: isSettingsLoading,
    revalidate: revalidateSettings,
    save: saveSettings,
    clear: clearSettings,
  } = useFireSettings();

  const { portfolio, isLoading: isPortfolioLoading } = usePortfolio();

  const { valuation, isLoading: isValuationLoading, baseCurrency } = usePortfolioValue(portfolio);

  // ── Derived State ──

  const isLoading = isSettingsLoading || isPortfolioLoading || isValuationLoading;
  const accounts = portfolio?.accounts ?? [];
  const hasSettings = settings !== null && settings !== undefined;

  // ── Setup completion state ──
  // When the user completes onboarding, we flip this to show the dashboard
  // without waiting for the next render cycle from useCachedPromise.

  const [setupComplete, setSetupComplete] = useState(false);

  // ── Callbacks ──

  /**
   * Handle initial setup save: persist settings and transition to dashboard.
   * Uses state to flip the view immediately rather than relying on the
   * async revalidation cycle.
   */
  const handleSetupSave = useCallback(
    async (newSettings: FireSettings): Promise<void> => {
      await saveSettings(newSettings);
      setSetupComplete(true);
    },
    [saveSettings],
  );

  /**
   * Handle settings save from the dashboard's edit flow.
   * The FireDashboard's pushed FireSetup handles pop() internally.
   */
  const handleDashboardSaveSettings = useCallback(
    async (newSettings: FireSettings): Promise<void> => {
      await saveSettings(newSettings);
    },
    [saveSettings],
  );

  /**
   * Handle contribution updates from FireContributions.
   * Merges the updated contributions array into the current settings.
   */
  const handleSaveContributions = useCallback(
    async (contributions: FireContribution[]): Promise<void> => {
      if (!settings) return;
      await saveSettings({
        ...settings,
        contributions,
      });
    },
    [settings, saveSettings],
  );

  /**
   * Handle settings reset — clears all FIRE data and returns to setup.
   */
  const handleClearSettings = useCallback(async (): Promise<void> => {
    await clearSettings();
    setSetupComplete(false);
  }, [clearSettings]);

  // ── Compute current portfolio value for context display ──

  const currentPortfolioValue = valuation?.totalValue ?? 0;

  // ── Loading State ──
  // Show a loading spinner while initial data is being fetched.

  if (isLoading && !hasSettings && !setupComplete) {
    return <Detail isLoading markdown="" />;
  }

  // ── Setup Phase ──
  // Show the onboarding form when no FIRE settings have been saved yet
  // (and the user hasn't just completed setup in this session).

  if (!hasSettings && !setupComplete) {
    return (
      <FireSetup
        accounts={accounts}
        currentPortfolioValue={currentPortfolioValue}
        baseCurrency={baseCurrency}
        onSave={handleSetupSave}
      />
    );
  }

  // ── Dashboard Phase ──
  // Settings exist (either loaded from storage or just saved).

  // If settings were just saved via onboarding but the hook hasn't
  // revalidated yet, we still render the dashboard — the useCachedPromise
  // optimistic update in useFireSettings ensures `settings` is available.

  if (settings) {
    return (
      <FireDashboard
        settings={settings}
        portfolio={portfolio}
        valuation={valuation}
        baseCurrency={baseCurrency}
        onSaveSettings={handleDashboardSaveSettings}
        onSaveContributions={handleSaveContributions}
        onClearSettings={handleClearSettings}
        revalidateSettings={revalidateSettings}
      />
    );
  }

  // ── Fallback ──
  // This should only show briefly after setup completion while
  // the settings hook revalidates from storage.

  return <Detail isLoading markdown="*Loading FIRE dashboard...*" />;
}
