/**
 * FIRE chart builder — pure functions that produce markdown strings
 * for rendering inside Raycast's Detail view.
 *
 * Zero side effects, zero Raycast imports. Fully testable.
 *
 * The main export `buildDashboardMarkdown` assembles the complete markdown
 * for the FIRE dashboard, including:
 *   - Horizontal bar chart of the year-by-year projection
 *   - Target line marker and FIRE year highlight
 *   - Contributions summary table
 *
 * Chart design:
 *   Each row is a year. The bar width is proportional to the portfolio value
 *   relative to the maximum value in the projection. The target position is
 *   marked with a vertical │ line so the user can see progress towards it.
 *   The FIRE year row gets a 🎯 marker.
 *
 *   Example output:
 *   ```
 *   2025  ██████████░░░░░░░░░░│░░  £420K
 *   2026  ███████████░░░░░░░░░│░░  £462K
 *   ...
 *   2033  █████████████████████████  £1.0M  🎯 FIRE!
 *   ```
 */

import { FireProjection, FireProjectionYear, FireSettings, FireContribution } from "./fire-types";

// ──────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────

/** Maximum character width of the bar portion of the chart */
const BAR_WIDTH = 28;

/** Filled block character for bar values */
const CHAR_FILLED = "█";

/** Empty block character for remaining bar space */
const CHAR_EMPTY = "░";

/** Target position marker */
const CHAR_TARGET = "│";

// ──────────────────────────────────────────
// Main Dashboard Builder
// ──────────────────────────────────────────

/**
 * Builds the complete markdown content for the FIRE dashboard Detail view.
 *
 * @param projection     - The computed FIRE projection
 * @param settings       - Current FIRE settings (for display context)
 * @param baseCurrency   - User's base currency code (e.g. "GBP")
 * @param contributions  - Resolved contribution list with display names
 * @returns Markdown string ready for Raycast's Detail view
 */
export function buildDashboardMarkdown(
  projection: FireProjection,
  settings: FireSettings,
  baseCurrency: string,
  contributions: Array<FireContribution & { displayName: string; accountName: string }>,
): string {
  const lines: string[] = [];

  // ── Header ──
  lines.push("# 🔥 FIRE Dashboard");
  lines.push("");

  // ── Status message ──
  if (projection.targetHitInWindow) {
    lines.push(
      `> **On track!** At current rates you'll reach financial independence in **${projection.fireYear}** (age ${projection.fireAge}).`,
    );
  } else {
    lines.push(
      `> ⚠️ **Target not reached within ${settings.annualGrowthRate > settings.annualInflation ? "30 years" : "the projection window"}.** Consider increasing contributions or adjusting your target.`,
    );
  }
  lines.push("");

  // ── Projection Chart ──
  lines.push("## Portfolio Projection");
  lines.push("");
  lines.push(buildProjectionChart(projection.years, projection.targetValue, baseCurrency, projection.fireYear));
  lines.push("");

  // ── Assumptions ──
  const realRateDisplay = (settings.annualGrowthRate - settings.annualInflation).toFixed(1);
  lines.push("---");
  lines.push("");
  lines.push(
    `*Growth ${settings.annualGrowthRate}% − Inflation ${settings.annualInflation}% = **${realRateDisplay}% real return** · ` +
      `Withdrawal rate ${settings.withdrawalRate}%*`,
  );
  lines.push("");

  // ── Contributions Table ──
  if (contributions.length > 0) {
    lines.push("## Monthly Contributions");
    lines.push("");
    lines.push("| Position | Account | Monthly | Annual |");
    lines.push("|----------|---------|--------:|-------:|");

    let totalMonthly = 0;
    for (const c of contributions) {
      const monthly = formatCompactValue(c.monthlyAmount, baseCurrency);
      const annual = formatCompactValue(c.monthlyAmount * 12, baseCurrency);
      lines.push(`| ${c.displayName} | ${c.accountName} | ${monthly} | ${annual} |`);
      totalMonthly += c.monthlyAmount;
    }

    if (contributions.length > 1) {
      const totalMonthlyStr = formatCompactValue(totalMonthly, baseCurrency);
      const totalAnnualStr = formatCompactValue(totalMonthly * 12, baseCurrency);
      lines.push(`| **Total** | | **${totalMonthlyStr}** | **${totalAnnualStr}** |`);
    }

    lines.push("");
  } else {
    lines.push("---");
    lines.push("");
    lines.push(
      "*No monthly contributions configured. Use the **Manage Contributions** action to add recurring investments.*",
    );
    lines.push("");
  }

  return lines.join("\n");
}

// ──────────────────────────────────────────
// Projection Chart
// ──────────────────────────────────────────

/**
 * Builds a horizontal bar chart from projection data.
 *
 * Uses a monospace code block for alignment. Each row shows:
 *   YEAR  [bar with target marker]  VALUE  [optional FIRE marker]
 *
 * The target value position is shown as a │ vertical line within
 * the bar track so the user can see how close each year gets.
 *
 * @param years        - Projection year data points
 * @param targetValue  - The FIRE target value (for the marker position)
 * @param baseCurrency - Currency code for value labels
 * @param fireYear     - The year FIRE is achieved (null if not within window)
 * @returns Markdown string containing the chart in a code block
 */
export function buildProjectionChart(
  years: FireProjectionYear[],
  targetValue: number,
  baseCurrency: string,
  fireYear: number | null,
): string {
  if (years.length === 0) return "*No projection data*";

  // Find the scale ceiling: max of all values and target
  const maxValue = Math.max(...years.map((y) => y.portfolioValue), targetValue);
  if (maxValue <= 0) return "*No projection data*";

  // Target position in the bar (as character index)
  const targetPos = Math.round((targetValue / maxValue) * BAR_WIDTH);

  const lines: string[] = [];
  lines.push("```");

  let prevTargetHit = false;

  for (const yearData of years) {
    const { year, portfolioValue, isTargetHit } = yearData;

    // Bar width proportional to value
    const filledWidth = Math.round((portfolioValue / maxValue) * BAR_WIDTH);

    // Build the bar with target marker
    const bar = buildBar(filledWidth, BAR_WIDTH, targetPos);

    // Value label
    const valueLabel = formatCompactValue(portfolioValue, baseCurrency);
    const paddedValue = valueLabel.padStart(8);

    // FIRE marker on the first year that hits the target
    const isFireYear = isTargetHit && !prevTargetHit;
    const marker = isFireYear ? "  🎯 FIRE!" : "";

    lines.push(`${year}  ${bar} ${paddedValue}${marker}`);

    prevTargetHit = isTargetHit;
  }

  lines.push("```");

  // Legend
  if (fireYear !== null) {
    lines.push(`\n*${CHAR_TARGET} = ${formatCompactValue(targetValue, baseCurrency)} target*`);
  } else {
    lines.push(`\n*${CHAR_TARGET} = ${formatCompactValue(targetValue, baseCurrency)} target (not yet reached)*`);
  }

  return lines.join("\n");
}

// ──────────────────────────────────────────
// Bar Construction
// ──────────────────────────────────────────

/**
 * Builds a single bar string with a target marker.
 *
 * The bar has three visual zones:
 *   1. Filled portion (█) — represents current value
 *   2. Empty portion (░) — remaining space
 *   3. Target marker (│) — overlaid at the target position
 *
 * If the filled portion extends past the target, the marker is hidden
 * (absorbed into the filled block).
 *
 * @param filledWidth - Number of filled characters
 * @param totalWidth  - Total bar width
 * @param targetPos   - Character position of the target marker (0-indexed)
 * @returns The assembled bar string
 */
export function buildBar(filledWidth: number, totalWidth: number, targetPos: number): string {
  const chars: string[] = [];

  for (let i = 0; i < totalWidth; i++) {
    if (i === targetPos && filledWidth <= targetPos) {
      // Show target marker only if we haven't filled past it
      chars.push(CHAR_TARGET);
    } else if (i < filledWidth) {
      chars.push(CHAR_FILLED);
    } else {
      chars.push(CHAR_EMPTY);
    }
  }

  return chars.join("");
}

// ──────────────────────────────────────────
// Value Formatting (chart-specific)
// ──────────────────────────────────────────

/**
 * Currency symbol lookup for chart labels.
 * Kept minimal — only currencies supported by the extension preferences.
 */
const CHART_CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: "£",
  USD: "$",
  EUR: "€",
  CHF: "Fr",
  JPY: "¥",
  CAD: "C$",
  AUD: "A$",
};

/**
 * Formats a value in compact notation for chart labels.
 *
 * Uses K/M/B suffixes to keep labels short and aligned.
 * This is a local implementation to avoid importing from formatting.ts
 * (which imports from Raycast-dependent constants).
 *
 * @param value        - Numeric value to format
 * @param currencyCode - ISO currency code
 * @returns Compact string like "£420K", "$1.2M", "€50"
 */
export function formatCompactValue(value: number, currencyCode: string): string {
  const symbol = CHART_CURRENCY_SYMBOLS[currencyCode] ?? currencyCode + " ";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (abs >= 1_000_000_000) {
    return `${sign}${symbol}${(abs / 1_000_000_000).toFixed(1)}B`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}${symbol}${(abs / 1_000).toFixed(0)}K`;
  }
  if (abs >= 1) {
    return `${sign}${symbol}${abs.toFixed(0)}`;
  }
  return `${sign}${symbol}0`;
}
