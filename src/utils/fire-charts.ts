/**
 * FIRE chart builder — pure functions that produce markdown strings
 * for rendering inside Raycast's Detail view.
 *
 * Zero side effects, zero Raycast imports. Fully testable.
 *
 * The main export `buildDashboardMarkdown` assembles the complete markdown
 * for the FIRE dashboard, including:
 *   - Status message with FIRE year or warning
 *   - Progress bar showing current vs target portfolio value
 *   - SVG stacked bar chart of the year-by-year projection (colour-coded
 *     portfolio growth vs contribution impact)
 *   - Compact contributions summary (emoji + bullet list, not a table)
 *   - Assumptions footer line
 *
 * The projection chart is rendered as an inline SVG image via a base64
 * data URI, which gives us full colour control inside Raycast's Detail
 * markdown. Each bar is split into two segments:
 *   - Portfolio Growth (white/dark) — compound growth on existing holdings
 *   - Contribution Impact (blue) — cumulative contributions + their growth
 *
 * A vertical dashed target line and green FIRE-year highlight complete
 * the visualisation.
 */

import { FireProjection, FireProjectionYear, FireSettings, FireContribution } from "./fire-types";
import { buildProjectionSVG, ChartBar, ChartConfig } from "./fire-svg";

// ──────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────

/** Maximum character width of the bar portion of the ASCII projection chart */
const BAR_WIDTH = 28;

/** Maximum character width of the progress bar */
const PROGRESS_WIDTH = 32;

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
 * Layout:
 *   1. Header + status blockquote
 *   2. Progress bar (current → target)
 *   3. Portfolio Projection SVG chart (stacked: growth + contributions)
 *   4. Separator
 *   5. Contributions summary (emoji list) or hint to add
 *   6. Assumptions footer
 *
 * @param projection     - The computed FIRE projection
 * @param settings       - Current FIRE settings (for display context)
 * @param baseCurrency   - User's base currency code (e.g. "GBP")
 * @param contributions  - Resolved contribution list with display names
 * @param theme          - Raycast appearance ("light" | "dark") for SVG colours
 * @returns Markdown string ready for Raycast's Detail view
 */
export function buildDashboardMarkdown(
  projection: FireProjection,
  settings: FireSettings,
  baseCurrency: string,
  contributions: Array<FireContribution & { displayName: string; accountName: string }>,
  theme: "light" | "dark" = "dark",
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

  // ── Progress Bar ──
  const progressBar = buildProgressBar(projection.currentPortfolioValue, projection.targetValue, baseCurrency);
  if (progressBar) {
    lines.push(progressBar);
    lines.push("");
  }

  // ── Projection Chart (SVG) ──
  lines.push("## Portfolio Projection");
  lines.push("");

  const chartBars = computeChartBars(projection, baseCurrency);
  const chartConfig: ChartConfig = {
    targetValue: projection.targetValue,
    targetLabel: formatCompactValue(projection.targetValue, baseCurrency),
    theme,
  };
  const svg = buildProjectionSVG(chartBars, chartConfig);

  if (svg) {
    const b64 = Buffer.from(svg).toString("base64");
    lines.push(`![FIRE Projection](data:image/svg+xml;base64,${b64})`);
  } else {
    // Fallback to ASCII chart if SVG fails (e.g. empty data)
    lines.push(buildProjectionChart(projection.years, projection.targetValue, baseCurrency, projection.fireYear));
  }
  lines.push("");

  // ── Footer ──
  lines.push("---");
  lines.push("");

  // ── Contributions summary ──
  lines.push(buildContributionsSummary(contributions, baseCurrency));
  lines.push("");

  // ── Assumptions ──
  const realRateDisplay = (settings.annualGrowthRate - settings.annualInflation).toFixed(1);
  lines.push(
    `*📈 Growth ${settings.annualGrowthRate}% − Inflation ${settings.annualInflation}% = **${realRateDisplay}% real return** · ` +
      `Withdrawal rate ${settings.withdrawalRate}%*`,
  );
  lines.push("");

  return lines.join("\n");
}

// ──────────────────────────────────────────
// Chart Data Decomposition
// ──────────────────────────────────────────

/**
 * Decomposes the projection into stacked chart bars.
 *
 * For each projection year, splits the total portfolio value into:
 *   - **Base growth**: compound growth on the initial portfolio (no contributions)
 *   - **Contribution impact**: everything else (contributions + their growth)
 *
 * Base growth series: `bg[0] = initial`, `bg[n] = bg[n-1] × (1 + realRate)`
 * Contribution component: `cc[n] = total[n] − bg[n]`
 *
 * @param projection   - Full FIRE projection result
 * @param baseCurrency - Currency code for label formatting
 * @returns Array of ChartBar objects ready for the SVG builder
 */
export function computeChartBars(projection: FireProjection, baseCurrency: string): ChartBar[] {
  const { years, currentPortfolioValue, realGrowthRate } = projection;
  if (years.length === 0) return [];

  // Build the "no contributions" base growth series
  const baseGrowthSeries: number[] = [currentPortfolioValue];
  for (let i = 1; i < years.length; i++) {
    baseGrowthSeries.push(baseGrowthSeries[i - 1] * (1 + realGrowthRate));
  }

  // Track first target hit for the isFireYear flag
  let prevTargetHit = false;

  return years.map((yearData, i) => {
    const baseGrowthValue = baseGrowthSeries[i];
    const contributionValue = Math.max(0, yearData.portfolioValue - baseGrowthValue);
    const isFireYear = yearData.isTargetHit && !prevTargetHit;
    prevTargetHit = yearData.isTargetHit;

    return {
      year: yearData.year,
      label: formatCompactValue(yearData.portfolioValue, baseCurrency),
      totalValue: yearData.portfolioValue,
      baseGrowthValue,
      contributionValue,
      isFireYear,
    };
  });
}

// ──────────────────────────────────────────
// Progress Bar
// ──────────────────────────────────────────

/**
 * Builds a compact progress bar showing current vs target portfolio value.
 *
 * Rendered inside a code block for monospace alignment:
 * ```
 * ████████████░░░░░░░░░░░░░░░░░░░░  42%  £420K → £1.0M
 * ```
 *
 * @param currentValue - Current included portfolio value
 * @param targetValue  - FIRE target value
 * @param baseCurrency - Currency code for labels
 * @returns Markdown code block string, or empty string if target ≤ 0
 */
export function buildProgressBar(currentValue: number, targetValue: number, baseCurrency: string): string {
  if (targetValue <= 0) return "";

  const percent = Math.min(100, Math.round((currentValue / targetValue) * 100));
  const filledCount = Math.round((percent / 100) * PROGRESS_WIDTH);
  const emptyCount = PROGRESS_WIDTH - filledCount;

  const bar = CHAR_FILLED.repeat(filledCount) + CHAR_EMPTY.repeat(emptyCount);
  const currentLabel = formatCompactValue(currentValue, baseCurrency);
  const targetLabel = formatCompactValue(targetValue, baseCurrency);

  const codeLines: string[] = [];
  codeLines.push("```");
  codeLines.push(`${bar}  ${percent}%  ${currentLabel} → ${targetLabel}`);
  codeLines.push("```");

  return codeLines.join("\n");
}

// ──────────────────────────────────────────
// Contributions Summary
// ──────────────────────────────────────────

/**
 * Builds a compact contributions summary for the dashboard footer.
 *
 * Replaces the old markdown table with a clean emoji + bullet-list format:
 *
 * Single contribution:
 *   💰 **£500/mo** → Vanguard S&P 500 · *Vanguard ISA* · £6,000/yr
 *
 * Multiple contributions:
 *   💰 **Contributions: £800/mo** · £9,600/yr
 *   - £500/mo → Vanguard S&P 500 · *Vanguard ISA*
 *   - £300/mo → Apple Inc. · *Vanguard ISA*
 *
 * No contributions:
 *   *💡 No monthly contributions configured. Add contributions (⌘⇧C) to ...*
 *
 * @param contributions  - Resolved contributions with display/account names
 * @param baseCurrency   - Currency code for formatting
 * @returns Markdown string (no trailing newline)
 */
export function buildContributionsSummary(
  contributions: Array<FireContribution & { displayName: string; accountName: string }>,
  baseCurrency: string,
): string {
  if (contributions.length === 0) {
    return "*💡 No monthly contributions configured. Add contributions (⌘⇧C) to model how regular investing accelerates your FIRE date*";
  }

  const totalMonthly = contributions.reduce((sum, c) => sum + c.monthlyAmount, 0);
  const lines: string[] = [];

  if (contributions.length === 1) {
    // Single contribution — compact one-liner
    const c = contributions[0];
    lines.push(
      `💰 **${formatCompactValue(c.monthlyAmount, baseCurrency)}/mo** → ${c.displayName} · *${c.accountName}* · ${formatCompactValue(c.monthlyAmount * 12, baseCurrency)}/yr`,
    );
  } else {
    // Multiple contributions — header line + bullet list
    const totalAnnual = totalMonthly * 12;
    lines.push(
      `💰 **Contributions: ${formatCompactValue(totalMonthly, baseCurrency)}/mo** · ${formatCompactValue(totalAnnual, baseCurrency)}/yr`,
    );
    for (const c of contributions) {
      lines.push(`- ${formatCompactValue(c.monthlyAmount, baseCurrency)}/mo → ${c.displayName} · *${c.accountName}*`);
    }
  }

  return lines.join("\n");
}

// ──────────────────────────────────────────
// ASCII Projection Chart (fallback)
// ──────────────────────────────────────────

/**
 * Builds a horizontal ASCII bar chart from projection data.
 *
 * Kept as a fallback in case SVG rendering fails. Uses a monospace code
 * block for alignment. Each row shows:
 *   YEAR  [bar with target marker]  VALUE  [optional FIRE marker]
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
 * Builds a single ASCII bar string with a target marker.
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
