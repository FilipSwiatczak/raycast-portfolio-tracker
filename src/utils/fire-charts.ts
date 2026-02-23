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
 *     base growth vs contribution impact)
 *   - SVG split chart showing accessible vs locked account breakdown
 *   - Compact contributions summary (emoji + bullet list, not a table)
 *   - Assumptions footer line
 *
 * The projection charts are rendered as inline SVG images via base64
 * data URIs, which gives us full colour control inside Raycast's Detail
 * markdown. The growth chart splits each bar into two segments:
 *   - Base (white/dark) — compound growth on existing holdings
 *   - Contribution Impact (blue) — cumulative contributions + their growth
 *
 * The split chart shows:
 *   - Accessible (green) — ISA/GIA/Brokerage etc. (withdrawable any time)
 *   - Locked (amber) — SIPP/401K (locked until pension access age)
 *   - Unlocked (light green) — locked funds after pension access age
 *
 * Vertical dashed target lines and green FIRE-year highlights complete
 * the visualisations.
 */

import { FireProjection, FireProjectionYear, FireSettings, FireContribution } from "./fire-types";
import { buildProjectionSVG, ChartBar, ChartConfig } from "./fire-svg";
import { buildSplitProjectionSVG, SplitChartBar, SplitChartConfig } from "./fire-svg-split";

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
// Split Portfolio Data
// ──────────────────────────────────────────

/**
 * Pre-computed split of the portfolio into accessible and locked portions.
 *
 * Passed by the component after classifying accounts by type.
 * When `lockedValue > 0 || lockedAnnualContribution > 0`, the dashboard
 * renders a second SVG chart showing the accessible vs locked breakdown.
 */
export interface SplitPortfolioData {
  /** Current value in accessible accounts (ISA/GIA/LISA/Brokerage etc.) */
  accessibleValue: number;
  /** Current value in locked accounts (SIPP/401K) */
  lockedValue: number;
  /** Annual contribution to accessible accounts */
  accessibleAnnualContribution: number;
  /** Annual contribution to locked accounts */
  lockedAnnualContribution: number;
}

// ──────────────────────────────────────────
// Main Dashboard Builder
// ──────────────────────────────────────────

/**
 * Builds the full FIRE dashboard markdown string.
 *
 * Layout (top to bottom):
 *   1. Dashboard header
 *   2. Status message (on-track / warning)
 *   3. Progress bar (current vs target)
 *   4. Growth projection SVG chart (base growth + contributions)
 *   5. Accessible vs Locked SVG chart (if locked accounts exist)
 *   6. Contributions summary (emoji list) or hint to add
 *   7. Assumptions footer
 *
 * @param projection     - The computed FIRE projection
 * @param settings       - Current FIRE settings (for display context)
 * @param baseCurrency   - User's base currency code (e.g. "GBP")
 * @param contributions  - Resolved contribution list with display names
 * @param theme          - Raycast appearance ("light" | "dark") for SVG colours
 * @param splitData      - Optional accessible/locked portfolio breakdown
 * @returns Markdown string ready for Raycast's Detail view
 */
export function buildDashboardMarkdown(
  projection: FireProjection,
  settings: FireSettings,
  baseCurrency: string,
  contributions: Array<FireContribution & { displayName: string; accountName: string }>,
  theme: "light" | "dark" = "dark",
  splitData?: SplitPortfolioData,
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
    title: "Growth with contributions",
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

  // ── Split Chart: Accessible vs Locked (SVG) ──
  if (splitData && (splitData.lockedValue > 0 || splitData.lockedAnnualContribution > 0)) {
    const splitBars = computeSplitChartBars(projection, splitData, settings, baseCurrency);
    if (splitBars.length > 0) {
      const sippAccessYear = settings.yearOfBirth + settings.sippAccessAge;
      const splitConfig: SplitChartConfig = {
        targetValue: projection.targetValue,
        targetLabel: formatCompactValue(projection.targetValue, baseCurrency),
        sippAccessYear:
          sippAccessYear >= projection.years[0].year &&
          sippAccessYear <= projection.years[projection.years.length - 1].year
            ? sippAccessYear
            : null,
        theme,
        title: "Accessible vs Locked",
      };
      const splitSvg = buildSplitProjectionSVG(splitBars, splitConfig);
      if (splitSvg) {
        const splitB64 = Buffer.from(splitSvg).toString("base64");
        lines.push(`![Split Projection](data:image/svg+xml;base64,${splitB64})`);
        lines.push("");
      }
    }
  }

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
 * Each bar also includes pre-formatted labels for inline display on the
 * bar segments.
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
      baseLabel: formatCompactValue(baseGrowthValue, baseCurrency),
      contribLabel: contributionValue > 0 ? formatCompactValue(contributionValue, baseCurrency) : undefined,
    };
  });
}

// ──────────────────────────────────────────
// Split Chart Data Decomposition
// ──────────────────────────────────────────

/**
 * Decomposes the projection into accessible vs locked chart bars.
 *
 * Projects accessible and locked portions independently using the same
 * real growth rate but separate starting values and contributions.
 * The sum `accessible[n] + locked[n]` equals the total projection for
 * each year (both portions grow at the same rate).
 *
 * After the FIRE year, contributions stop for both portions (matching
 * the main projection engine behaviour).
 *
 * @param projection   - Full FIRE projection result
 * @param splitData    - Accessible/locked starting values and contributions
 * @param settings     - FIRE settings (for sippAccessAge, yearOfBirth)
 * @param baseCurrency - Currency code for label formatting
 * @returns Array of SplitChartBar objects ready for the split SVG builder
 */
export function computeSplitChartBars(
  projection: FireProjection,
  splitData: SplitPortfolioData,
  settings: FireSettings,
  baseCurrency: string,
): SplitChartBar[] {
  const { years, realGrowthRate, fireYear } = projection;
  if (years.length === 0) return [];

  const sippAccessYear = settings.yearOfBirth + settings.sippAccessAge;

  // Build separate growth series for accessible and locked
  const accessibleSeries: number[] = [splitData.accessibleValue];
  const lockedSeries: number[] = [splitData.lockedValue];

  for (let i = 1; i < years.length; i++) {
    const yearNum = years[i].year;

    // Stop contributions after the FIRE year (matching main projection)
    const preFire = fireYear === null || yearNum <= fireYear;
    const accContrib = preFire ? splitData.accessibleAnnualContribution : 0;
    const lockContrib = preFire ? splitData.lockedAnnualContribution : 0;

    // Same half-year contribution approximation as the main calculator
    accessibleSeries.push(accessibleSeries[i - 1] * (1 + realGrowthRate) + accContrib * (1 + realGrowthRate / 2));
    lockedSeries.push(lockedSeries[i - 1] * (1 + realGrowthRate) + lockContrib * (1 + realGrowthRate / 2));
  }

  // Track first target hit for the isFireYear flag
  let prevTargetHit = false;

  return years.map((yearData, i) => {
    const accessibleValue = accessibleSeries[i];
    const lockedValue = lockedSeries[i];
    const totalValue = accessibleValue + lockedValue;
    const isSippAccessible = yearData.year >= sippAccessYear;
    const isFireYear = yearData.isTargetHit && !prevTargetHit;
    prevTargetHit = yearData.isTargetHit;

    return {
      year: yearData.year,
      label: formatCompactValue(totalValue, baseCurrency),
      accessibleValue,
      lockedValue,
      totalValue,
      accessibleLabel: formatCompactValue(accessibleValue, baseCurrency),
      lockedLabel: lockedValue > 0 ? formatCompactValue(lockedValue, baseCurrency) : "",
      isSippAccessible,
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
 * Builds an ASCII horizontal bar chart for the projection.
 *
 * This is the fallback renderer when the SVG builder returns empty
 * (e.g. no data). The SVG chart is preferred for all normal cases.
 *
 * Renders inside a code block for monospace alignment.
 *
 * @param years        - Projection timeline
 * @param targetValue  - FIRE target value (for the marker)
 * @param baseCurrency - Currency code for labels
 * @param fireYear     - The FIRE year (for the 🎯 marker), or null
 * @returns Markdown code block string
 */
export function buildProjectionChart(
  years: FireProjectionYear[],
  targetValue: number,
  baseCurrency: string,
  fireYear: number | null,
): string {
  if (years.length === 0) return "*No projection data available.*";

  // Max value for scaling
  const maxValue = Math.max(...years.map((y) => y.portfolioValue), targetValue);
  if (maxValue <= 0) return "*No projection data available.*";

  // Target position as a character index
  const targetPos = Math.round((targetValue / maxValue) * BAR_WIDTH);

  const lines: string[] = [];
  lines.push("```");

  let prevTargetHit = false;

  for (const { year, portfolioValue, isTargetHit } of years) {
    // Calculate filled width
    const filledWidth = Math.round((portfolioValue / maxValue) * BAR_WIDTH);

    // Build the bar with optional target marker
    const bar = buildBar(BAR_WIDTH, filledWidth, targetPos);

    // Format value label
    const valueLabel = formatCompactValue(portfolioValue, baseCurrency);
    const paddedValue = valueLabel.padStart(7);

    // Mark the FIRE year (first year target is hit)
    const isFireYear = isTargetHit && !prevTargetHit;
    const marker = isFireYear ? " 🎯" : "";
    prevTargetHit = isTargetHit;

    lines.push(`${year} ${bar} ${paddedValue}${marker}`);
  }

  // Legend line
  const targetLabel = formatCompactValue(targetValue, baseCurrency);
  const fireInfo = fireYear ? `FIRE ${fireYear}` : "not yet reached";
  lines.push(`     ${"─".repeat(BAR_WIDTH)}  ${targetLabel} target · ${fireInfo}`);

  lines.push("```");

  return lines.join("\n");
}

/**
 * Builds a single bar string with optional target marker.
 *
 * @param totalWidth  - Total character width of the bar
 * @param filledWidth - Number of filled characters
 * @param targetPos   - Character position for the target marker
 * @returns Formatted bar string
 */
export function buildBar(totalWidth: number, filledWidth: number, targetPos: number): string {
  const chars: string[] = [];
  for (let i = 0; i < totalWidth; i++) {
    if (i === targetPos && i >= filledWidth) {
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
