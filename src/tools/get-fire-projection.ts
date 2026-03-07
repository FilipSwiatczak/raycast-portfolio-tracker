/**
 * AI Tool: get-fire-projection
 *
 * Returns the user's FIRE (Financial Independence, Retire Early) projection
 * including current settings, contributions breakdown, and the calculated
 * projection timeline. This is the primary tool for answering FIRE-related
 * questions.
 *
 * No inputs required — reads directly from persisted FIRE settings and
 * portfolio data to compute the projection.
 */

import {
  loadPortfolioForTool,
  loadFireSettingsForTool,
  buildFireSummary,
} from "./tool-data";
import { formatCurrency, formatPercent } from "../utils/formatting";

/**
 * Retrieves the user's FIRE projection, settings, and contribution details.
 *
 * Use this tool to answer questions like "When will I reach FIRE?",
 * "What's my FIRE number?", "How many days until I retire?",
 * "What's my current FIRE trajectory?", "What are my FIRE contributions?",
 * or "What if I increase my contributions by 10%?".
 *
 * The projection uses real (inflation-adjusted) returns. The FIRE number
 * is the target portfolio value at which the user achieves financial
 * independence based on their configured withdrawal rate.
 */
export default async function tool() {
  const settings = await loadFireSettingsForTool();

  if (!settings) {
    return "The user has not configured their FIRE settings yet. They need to set up the FIRE Dashboard first using the FIRE Dashboard command — this includes setting a target value, growth rate, inflation, withdrawal rate, year of birth, and contributions.";
  }

  const portfolio = await loadPortfolioForTool();
  const summary = buildFireSummary(settings, portfolio);

  const lines: string[] = [];

  // ── Settings Overview ──

  lines.push("FIRE Settings:");
  lines.push(`  Target (FIRE Number): ${formatCurrency(summary.settings.targetValue, "GBP")}`);
  lines.push(`  Withdrawal Rate: ${formatPercent(summary.settings.withdrawalRate, { showSign: false })}`);
  lines.push(`  Annual Growth Rate (Nominal): ${formatPercent(summary.settings.annualGrowthRate, { showSign: false })}`);
  lines.push(`  Annual Inflation: ${formatPercent(summary.settings.annualInflation, { showSign: false })}`);
  lines.push(`  Real Growth Rate: ${formatPercent(summary.projection.realGrowthRate * 100, { showSign: false })}`);
  lines.push(`  Year of Birth: ${summary.settings.yearOfBirth}`);
  lines.push(`  SIPP Access Age: ${summary.settings.sippAccessAge}`);
  lines.push(`  Holiday Entitlement: ${summary.settings.holidayEntitlement} days/year`);

  if (summary.settings.targetFireAge) {
    lines.push(`  Target FIRE Age: ${summary.settings.targetFireAge}`);
  }
  if (summary.settings.targetFireYear) {
    lines.push(`  Target FIRE Year: ${summary.settings.targetFireYear}`);
  }

  if (summary.settings.excludedAccountIds.length > 0) {
    lines.push(`  Excluded Accounts: ${summary.settings.excludedAccountIds.length} account(s) excluded from FIRE calculations`);
  }

  lines.push("");

  // ── Contributions ──

  lines.push("Contributions:");
  lines.push(`  Total Monthly: ${formatCurrency(summary.contributions.totalMonthly, "GBP")}`);
  lines.push(`  Total Annual: ${formatCurrency(summary.contributions.totalAnnual, "GBP")}`);

  if (summary.contributions.items.length > 0) {
    lines.push("  Breakdown:");
    for (const item of summary.contributions.items) {
      lines.push(`    - ${item.positionName} in ${item.accountName}: ${formatCurrency(item.monthlyAmount, "GBP")}/month`);
    }
  } else {
    lines.push("  No contributions configured.");
  }

  lines.push("");

  // ── Projection ──

  lines.push("Projection:");
  lines.push(`  Current Portfolio Value (included): ${formatCurrency(summary.projection.currentPortfolioValue, "GBP")}`);
  lines.push(`  Target Value: ${formatCurrency(summary.projection.targetValue, "GBP")}`);

  if (summary.projection.targetHitInWindow) {
    lines.push(`  FIRE Year: ${summary.projection.fireYear}`);
    lines.push(`  FIRE Age: ${summary.projection.fireAge}`);

    if (summary.projection.daysToFire !== null) {
      lines.push(`  Calendar Days to FIRE: ${summary.projection.daysToFire.toLocaleString()}`);
    }
    if (summary.projection.workingDaysToFire !== null) {
      lines.push(`  Working Days to FIRE: ${summary.projection.workingDaysToFire.toLocaleString()}`);
    }
  } else {
    lines.push("  FIRE target is NOT reached within the projection window (30 years).");
    lines.push("  The user may need to increase contributions, reduce their target, or adjust growth assumptions.");
  }

  return lines.join("\n");
}
