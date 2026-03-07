/**
 * AI Tool: simulate-fire-scenario
 *
 * Runs a custom FIRE projection with user-specified overrides for what-if
 * analysis. The user's current FIRE settings are used as the baseline, and
 * any provided overrides are applied on top before running the projection.
 *
 * This enables natural-language questions like:
 * - "What if I increase my contributions by £200/month?"
 * - "What if inflation rises to 4%?"
 * - "What if my growth rate drops to 5%?"
 * - "What if I change my FIRE target to £800,000?"
 * - "What happens if I start with £300,000 and contribute £2,000/month?"
 */

import { loadFireSettingsForTool } from "./tool-data";
import { calculateProjection, totalAnnualContribution } from "../services/fire-calculator";
import { formatCurrency, formatPercent } from "../utils/formatting";

type Input = {
  /**
   * Override for the starting portfolio value in the user's base currency.
   * If not provided, the current FIRE settings' computed portfolio value is used.
   * Example: 300000
   */
  currentPortfolioValue?: number;

  /**
   * Override for the FIRE target value (the "FIRE number") in the user's base currency.
   * If not provided, the user's configured target is used.
   * Example: 1000000
   */
  targetValue?: number;

  /**
   * Override for the nominal annual growth rate as a percentage.
   * If not provided, the user's configured rate is used.
   * Example: 8 means 8% annual growth
   */
  annualGrowthRate?: number;

  /**
   * Override for the annual inflation rate as a percentage.
   * If not provided, the user's configured rate is used.
   * Example: 3 means 3% inflation
   */
  annualInflation?: number;

  /**
   * Override for the total monthly contribution amount in the user's base currency.
   * When provided, this replaces the sum of all individual contributions.
   * If not provided, the total from the user's configured contributions is used.
   * Example: 2000 means £2,000/month total contributions
   */
  monthlyContribution?: number;

  /**
   * An amount to ADD to the current monthly contribution total.
   * Mutually exclusive with monthlyContribution — if both are provided,
   * monthlyContribution takes precedence.
   * Example: 200 means add £200/month on top of current contributions
   */
  additionalMonthlyContribution?: number;

  /**
   * Override for the user's year of birth.
   * If not provided, the user's configured year is used.
   * Example: 1990
   */
  yearOfBirth?: number;

  /**
   * Override for the withdrawal rate as a percentage.
   * Used in the response to contextualise the scenario but does not
   * change the projection calculation (projection targets the FIRE number).
   * Example: 3.5 means 3.5% withdrawal rate
   */
  withdrawalRate?: number;
};

/**
 * Simulates a FIRE projection with custom parameters for what-if analysis.
 *
 * Use this tool when the user asks hypothetical questions about their FIRE
 * journey, such as "What if I increase contributions by £200/month?",
 * "What if growth drops to 5%?", "What if I target £800k instead?",
 * or "How long if I start with £300k and save £2k/month at 6% growth?".
 *
 * The tool loads the user's current FIRE settings as a baseline, applies
 * any overrides from the input, and runs a new projection. Both the
 * baseline and scenario results are returned for comparison.
 *
 * To get the user's current FIRE settings and projection first, use
 * the get-fire-projection tool.
 */
export default async function tool(input: Input) {
  const settings = await loadFireSettingsForTool();

  if (!settings) {
    return "The user has not configured their FIRE settings yet. They need to set up the FIRE Dashboard first using the FIRE Dashboard command. Once configured, you can run what-if scenarios against their settings.";
  }

  // ── Build baseline values ──

  const baselineAnnualContrib = totalAnnualContribution(settings.contributions);
  const baselineMonthly = baselineAnnualContrib / 12;

  const baselinePortfolioValue = 0; // Tools don't have live valuation; uses 0 as starting point
  const baselineTargetValue = settings.targetValue;
  const baselineGrowthRate = settings.annualGrowthRate;
  const baselineInflation = settings.annualInflation;
  const baselineYearOfBirth = settings.yearOfBirth;
  const baselineWithdrawalRate = settings.withdrawalRate;

  // ── Apply overrides for scenario ──

  const scenarioPortfolioValue = input.currentPortfolioValue ?? baselinePortfolioValue;
  const scenarioTargetValue = input.targetValue ?? baselineTargetValue;
  const scenarioGrowthRate = input.annualGrowthRate ?? baselineGrowthRate;
  const scenarioInflation = input.annualInflation ?? baselineInflation;
  const scenarioYearOfBirth = input.yearOfBirth ?? baselineYearOfBirth;
  const scenarioWithdrawalRate = input.withdrawalRate ?? baselineWithdrawalRate;

  let scenarioMonthly: number;
  if (input.monthlyContribution !== undefined) {
    scenarioMonthly = input.monthlyContribution;
  } else if (input.additionalMonthlyContribution !== undefined) {
    scenarioMonthly = baselineMonthly + input.additionalMonthlyContribution;
  } else {
    scenarioMonthly = baselineMonthly;
  }
  const scenarioAnnualContrib = scenarioMonthly * 12;

  // ── Run baseline projection ──

  const baselineProjection = calculateProjection({
    currentPortfolioValue: baselinePortfolioValue,
    targetValue: baselineTargetValue,
    annualGrowthRate: baselineGrowthRate,
    annualInflation: baselineInflation,
    annualContribution: baselineAnnualContrib,
    yearOfBirth: baselineYearOfBirth,
    sippAccessAge: settings.sippAccessAge,
    holidayEntitlement: settings.holidayEntitlement,
  });

  // ── Run scenario projection ──

  const scenarioProjection = calculateProjection({
    currentPortfolioValue: scenarioPortfolioValue,
    targetValue: scenarioTargetValue,
    annualGrowthRate: scenarioGrowthRate,
    annualInflation: scenarioInflation,
    annualContribution: scenarioAnnualContrib,
    yearOfBirth: scenarioYearOfBirth,
    sippAccessAge: settings.sippAccessAge,
    holidayEntitlement: settings.holidayEntitlement,
  });

  // ── Format response ──

  const lines: string[] = [];

  lines.push("FIRE What-If Scenario Comparison");
  lines.push("================================");
  lines.push("");

  // ── Describe what changed ──

  const changes: string[] = [];
  if (input.currentPortfolioValue !== undefined) {
    changes.push(
      `Starting Portfolio: ${formatCurrency(baselinePortfolioValue, "GBP")} → ${formatCurrency(scenarioPortfolioValue, "GBP")}`,
    );
  }
  if (input.targetValue !== undefined) {
    changes.push(
      `FIRE Target: ${formatCurrency(baselineTargetValue, "GBP")} → ${formatCurrency(scenarioTargetValue, "GBP")}`,
    );
  }
  if (input.annualGrowthRate !== undefined) {
    changes.push(
      `Growth Rate: ${formatPercent(baselineGrowthRate, { showSign: false })} → ${formatPercent(scenarioGrowthRate, { showSign: false })}`,
    );
  }
  if (input.annualInflation !== undefined) {
    changes.push(
      `Inflation: ${formatPercent(baselineInflation, { showSign: false })} → ${formatPercent(scenarioInflation, { showSign: false })}`,
    );
  }
  if (input.monthlyContribution !== undefined || input.additionalMonthlyContribution !== undefined) {
    changes.push(
      `Monthly Contributions: ${formatCurrency(baselineMonthly, "GBP")} → ${formatCurrency(scenarioMonthly, "GBP")}`,
    );
  }
  if (input.withdrawalRate !== undefined) {
    changes.push(
      `Withdrawal Rate: ${formatPercent(baselineWithdrawalRate, { showSign: false })} → ${formatPercent(scenarioWithdrawalRate, { showSign: false })}`,
    );
  }
  if (input.yearOfBirth !== undefined) {
    changes.push(`Year of Birth: ${baselineYearOfBirth} → ${scenarioYearOfBirth}`);
  }

  if (changes.length > 0) {
    lines.push("Changes Applied:");
    for (const change of changes) {
      lines.push(`  • ${change}`);
    }
  } else {
    lines.push("No overrides applied — this is the same as the baseline projection.");
  }

  lines.push("");

  // ── Baseline Results ──

  lines.push("Baseline (Current Settings):");
  lines.push(`  Monthly Contributions: ${formatCurrency(baselineMonthly, "GBP")}`);
  lines.push(`  Annual Contributions: ${formatCurrency(baselineAnnualContrib, "GBP")}`);
  lines.push(`  Real Growth Rate: ${formatPercent(baselineProjection.realGrowthRate * 100, { showSign: false })}`);

  if (baselineProjection.targetHitInWindow) {
    lines.push(`  FIRE Year: ${baselineProjection.fireYear}`);
    lines.push(`  FIRE Age: ${baselineProjection.fireAge}`);
    if (baselineProjection.daysToFire !== null) {
      lines.push(`  Days to FIRE: ${baselineProjection.daysToFire.toLocaleString()}`);
    }
    if (baselineProjection.workingDaysToFire !== null) {
      lines.push(`  Working Days to FIRE: ${baselineProjection.workingDaysToFire.toLocaleString()}`);
    }
  } else {
    lines.push("  FIRE target NOT reached within 30-year projection window.");
  }

  lines.push("");

  // ── Scenario Results ──

  lines.push("Scenario (With Changes):");
  lines.push(`  Monthly Contributions: ${formatCurrency(scenarioMonthly, "GBP")}`);
  lines.push(`  Annual Contributions: ${formatCurrency(scenarioAnnualContrib, "GBP")}`);
  lines.push(`  Real Growth Rate: ${formatPercent(scenarioProjection.realGrowthRate * 100, { showSign: false })}`);

  if (scenarioProjection.targetHitInWindow) {
    lines.push(`  FIRE Year: ${scenarioProjection.fireYear}`);
    lines.push(`  FIRE Age: ${scenarioProjection.fireAge}`);
    if (scenarioProjection.daysToFire !== null) {
      lines.push(`  Days to FIRE: ${scenarioProjection.daysToFire.toLocaleString()}`);
    }
    if (scenarioProjection.workingDaysToFire !== null) {
      lines.push(`  Working Days to FIRE: ${scenarioProjection.workingDaysToFire.toLocaleString()}`);
    }
  } else {
    lines.push("  FIRE target NOT reached within 30-year projection window.");
  }

  lines.push("");

  // ── Comparison ──

  lines.push("Impact:");

  if (baselineProjection.targetHitInWindow && scenarioProjection.targetHitInWindow) {
    const yearDiff = scenarioProjection.fireYear! - baselineProjection.fireYear!;

    if (yearDiff === 0) {
      lines.push("  No change in FIRE timeline — target is reached in the same year.");
    } else if (yearDiff < 0) {
      lines.push(
        `  FIRE reached ${Math.abs(yearDiff)} year(s) EARLIER (age ${scenarioProjection.fireAge} vs ${baselineProjection.fireAge}).`,
      );
    } else {
      lines.push(
        `  FIRE reached ${yearDiff} year(s) LATER (age ${scenarioProjection.fireAge} vs ${baselineProjection.fireAge}).`,
      );
    }

    if (baselineProjection.daysToFire !== null && scenarioProjection.daysToFire !== null) {
      const daysDiff = scenarioProjection.daysToFire - baselineProjection.daysToFire;
      if (daysDiff !== 0) {
        const direction = daysDiff < 0 ? "fewer" : "more";
        lines.push(`  ${Math.abs(daysDiff).toLocaleString()} ${direction} calendar days to FIRE.`);
      }
    }
  } else if (!baselineProjection.targetHitInWindow && scenarioProjection.targetHitInWindow) {
    lines.push(
      `  The scenario ENABLES reaching FIRE (in ${scenarioProjection.fireYear}, age ${scenarioProjection.fireAge}) — the baseline did not reach it within 30 years.`,
    );
  } else if (baselineProjection.targetHitInWindow && !scenarioProjection.targetHitInWindow) {
    lines.push(
      "  The scenario PREVENTS reaching FIRE within the 30-year projection window — the baseline did reach it.",
    );
  } else {
    lines.push("  Neither the baseline nor the scenario reaches FIRE within 30 years.");
  }

  return lines.join("\n");
}
