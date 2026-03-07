/**
 * AI Tool: get-fire-projection
 *
 * Returns the user's FIRE (Financial Independence, Retire Early) projection
 * including current settings, contributions breakdown, the calculated
 * projection timeline, Coast FIRE analysis, lump sum solver, and all
 * mathematical formulas needed for accurate AI reasoning.
 *
 * No inputs required — reads directly from persisted FIRE settings and
 * portfolio data to compute the projection.
 */

import { loadPortfolioForTool, loadFireSettingsForTool, buildFireSummary } from "./tool-data";
import { formatCurrency, formatPercent } from "../utils/formatting";

/**
 * Retrieves the user's FIRE projection, settings, contribution details,
 * and Coast FIRE analysis.
 *
 * Use this tool to answer questions like:
 * - "When will I reach FIRE?"
 * - "What's my FIRE number?"
 * - "How many days until I retire?"
 * - "What's my current FIRE trajectory?"
 * - "Can I coast to FIRE if I stop contributing now?"
 * - "When can I start coasting if I want to retire at age 55?"
 * - "What age can I retire if I coast from today?"
 *
 * The projection uses real (inflation-adjusted) returns. The FIRE number
 * is the target portfolio value at which the user achieves financial
 * independence based on their configured withdrawal rate.
 *
 * All formulas are included in the output so the AI can answer follow-up
 * questions and extend calculations without re-fetching data.
 */
export default async function tool() {
  const settings = await loadFireSettingsForTool();

  if (!settings) {
    return "The user has not configured their FIRE settings yet. They need to set up the FIRE Dashboard first using the FIRE Dashboard command — this includes setting a target value, growth rate, inflation, withdrawal rate, year of birth, and contributions.";
  }

  const portfolio = await loadPortfolioForTool();
  const summary = await buildFireSummary(settings, portfolio);

  const currentYear = new Date().getFullYear();
  const realRate = summary.projection.realGrowthRate; // decimal, e.g. 0.045
  const realRatePct = realRate * 100;
  const P = summary.projection.currentPortfolioValue;
  const FN = summary.projection.targetValue;
  const C = summary.contributions.totalAnnual;
  const monthlyC = summary.contributions.totalMonthly;

  const lines: string[] = [];

  // ── Mathematical Reference ──────────────────────────────────────────────────

  lines.push("═══════════════════════════════════════════════════════");
  lines.push("MATHEMATICAL REFERENCE (use these for all calculations)");
  lines.push("═══════════════════════════════════════════════════════");
  lines.push("");
  lines.push("CORE FORMULAS:");
  lines.push("");
  lines.push("  1. Real Growth Rate:");
  lines.push("     r = (nominalGrowthRate - inflationRate) / 100");
  lines.push(
    `     r = (${formatPercent(settings.annualGrowthRate, { showSign: false })} - ${formatPercent(settings.annualInflation, { showSign: false })}) / 100`,
  );
  lines.push(`     r = ${realRate.toFixed(6)}  (${formatPercent(realRatePct, { showSign: false })} real return)`);
  lines.push("");
  lines.push("  2. FIRE Number (from spending):");
  lines.push("     FIRE_Number = Annual_Spending × (100 / withdrawalRate)");
  lines.push(
    `     At ${formatPercent(settings.withdrawalRate, { showSign: false })} withdrawal: FIRE_Number = Annual_Spending × ${(100 / settings.withdrawalRate).toFixed(2)}`,
  );
  lines.push(`     Configured FIRE Number: ${formatCurrency(FN, "GBP")}`);
  lines.push("");
  lines.push("  3. Year-by-Year Portfolio Growth (with contributions):");
  lines.push("     V(n) = V(n-1) × (1 + r) + C × (1 + r/2)");
  lines.push("     where:");
  lines.push("       V(n)   = portfolio value at end of year n");
  lines.push("       r      = real annual growth rate (decimal)");
  lines.push("       C      = annual contribution (monthly × 12)");
  lines.push("       r/2    = half-year approximation for mid-year contributions");
  lines.push("");
  lines.push("  4. Time to FIRE without contributions (pure compound growth):");
  lines.push("     n = log(FN / P) / log(1 + r)");
  lines.push("     where P = current portfolio, FN = FIRE Number, r = real rate");
  lines.push("");
  lines.push("  5. Time to FIRE with regular contributions:");
  lines.push("     Solved iteratively year-by-year using Formula 3.");
  lines.push("     Closed form approximation:");
  lines.push("     n ≈ log((FN × r + C) / (P × r + C)) / log(1 + r)");
  lines.push("");
  lines.push("  6. Coast FIRE Number (portfolio needed to reach FN with zero contributions):");
  lines.push("     Coast_FIRE_Number(n) = FN / (1 + r)^n");
  lines.push("     where n = years remaining until target retirement year");
  lines.push("");
  lines.push("  7. Coast FIRE retirement age (if coasting from NOW with current portfolio P):");
  lines.push("     n_coast = log(FN / P) / log(1 + r)");
  lines.push("     retirementYear = currentYear + n_coast");
  lines.push("     retirementAge  = retirementYear - yearOfBirth");
  lines.push("     (This is how old the user will be if they stop contributing TODAY)");
  lines.push("");
  lines.push("  8. Year to start coasting (to retire at a target age/year T):");
  lines.push("     yearsToT = targetRetirementYear - currentYear");
  lines.push("     Required_Coast_FIRE_Balance = FN / (1 + r)^yearsToT");
  lines.push("     Then solve: when does V(n) reach Required_Coast_FIRE_Balance");
  lines.push("       using year-by-year growth with contributions (Formula 3).");
  lines.push("     coastYear = first year where V(n) >= Required_Coast_FIRE_Balance");
  lines.push("");
  lines.push("  9. Safe withdrawal income check:");
  lines.push("     Annual_Income = FIRE_Number × (withdrawalRate / 100)");
  lines.push(
    `     At current FIRE Number: ${formatCurrency(FN * (settings.withdrawalRate / 100), "GBP")}/year = ${formatCurrency((FN * (settings.withdrawalRate / 100)) / 12, "GBP")}/month`,
  );
  lines.push("");
  lines.push("  10. Lump sum needed to reach a target FIRE year (without changing contributions):");
  lines.push("      Derived by expanding V(N) = FN over N years and solving for P:");
  lines.push("        V(N) = P × (1+r)^N  +  C × (1 + r/2) × [(1+r)^N - 1] / r  =  FN");
  lines.push("        P_required = [ FN  -  C × (1 + r/2) × ((1+r)^N - 1) / r ]  /  (1+r)^N");
  lines.push("        Lump_Sum   = P_required - P_current   (additional capital needed today)");
  lines.push("      where N = targetFireYear - currentYear, C = annual contribution, r = real rate");
  lines.push("      NOTE: if C = 0 (no contributions) the formula simplifies to:");
  lines.push("        P_required = FN / (1 + r)^N");
  lines.push("");

  // ── Current Values ──────────────────────────────────────────────────────────

  lines.push("CURRENT VALUES (substitute into formulas above):");
  lines.push(`  P  (current portfolio)   = ${formatCurrency(P, "GBP")}`);
  lines.push(`  FN (FIRE Number / target)= ${formatCurrency(FN, "GBP")}`);
  lines.push(`  r  (real growth rate)    = ${realRate.toFixed(6)}`);
  lines.push(
    `  C  (annual contribution) = ${formatCurrency(C, "GBP")} (${formatCurrency(monthlyC, "GBP")}/month × 12)`,
  );
  lines.push(`  currentYear              = ${currentYear}`);
  lines.push(`  yearOfBirth              = ${settings.yearOfBirth}`);
  lines.push(`  withdrawalRate           = ${formatPercent(settings.withdrawalRate, { showSign: false })}`);
  lines.push(`  nominalGrowthRate        = ${formatPercent(settings.annualGrowthRate, { showSign: false })}`);
  lines.push(`  inflationRate            = ${formatPercent(settings.annualInflation, { showSign: false })}`);
  lines.push(`  sippAccessAge            = ${settings.sippAccessAge}`);
  lines.push(`  holidayEntitlement       = ${settings.holidayEntitlement} days/year`);
  lines.push("");

  // ── FIRE Progress ───────────────────────────────────────────────────────────

  const progressPct = FN > 0 ? (P / FN) * 100 : 0;
  const gap = Math.max(0, FN - P);
  lines.push("FIRE PROGRESS:");
  lines.push(
    `  Progress to FIRE: ${progressPct.toFixed(1)}%  (${formatCurrency(P, "GBP")} of ${formatCurrency(FN, "GBP")})`,
  );
  lines.push(`  Remaining gap:    ${formatCurrency(gap, "GBP")}`);
  lines.push("");

  // ── Settings Overview ───────────────────────────────────────────────────────

  lines.push("FIRE SETTINGS:");
  lines.push(`  Target (FIRE Number):       ${formatCurrency(summary.settings.targetValue, "GBP")}`);
  lines.push(`  Withdrawal Rate:            ${formatPercent(summary.settings.withdrawalRate, { showSign: false })}`);
  lines.push(`  Annual Growth Rate (Nominal):${formatPercent(summary.settings.annualGrowthRate, { showSign: false })}`);
  lines.push(`  Annual Inflation:           ${formatPercent(summary.settings.annualInflation, { showSign: false })}`);
  lines.push(`  Real Growth Rate:           ${formatPercent(realRatePct, { showSign: false })}`);
  lines.push(`  Year of Birth:              ${summary.settings.yearOfBirth}`);
  lines.push(`  SIPP Access Age:            ${summary.settings.sippAccessAge}`);
  lines.push(`  Holiday Entitlement:        ${summary.settings.holidayEntitlement} days/year`);

  if (summary.settings.targetFireAge) {
    lines.push(`  Target FIRE Age:            ${summary.settings.targetFireAge}`);
  }
  if (summary.settings.targetFireYear) {
    lines.push(`  Target FIRE Year:           ${summary.settings.targetFireYear}`);
  }
  if (summary.settings.excludedAccountIds.length > 0) {
    lines.push(`  Excluded Accounts:          ${summary.settings.excludedAccountIds.length} account(s) excluded`);
  }
  lines.push("");

  // ── Contributions ───────────────────────────────────────────────────────────

  lines.push("CONTRIBUTIONS:");
  lines.push(`  Total Monthly:  ${formatCurrency(summary.contributions.totalMonthly, "GBP")}`);
  lines.push(`  Total Annual:   ${formatCurrency(summary.contributions.totalAnnual, "GBP")}`);

  if (summary.contributions.items.length > 0) {
    lines.push("  Breakdown:");
    for (const item of summary.contributions.items) {
      lines.push(
        `    - ${item.positionName} in ${item.accountName}: ${formatCurrency(item.monthlyAmount, "GBP")}/month`,
      );
    }
  } else {
    lines.push("  No contributions configured.");
  }
  lines.push("");

  // ── FIRE Projection ─────────────────────────────────────────────────────────

  lines.push("FIRE PROJECTION:");
  lines.push(`  Current Portfolio Value: ${formatCurrency(summary.projection.currentPortfolioValue, "GBP")}`);
  lines.push(`  Target Value:            ${formatCurrency(summary.projection.targetValue, "GBP")}`);

  if (summary.projection.targetHitInWindow) {
    lines.push(`  FIRE Year:               ${summary.projection.fireYear}`);
    lines.push(`  FIRE Age:                ${summary.projection.fireAge}`);

    if (summary.projection.daysToFire !== null) {
      lines.push(`  Calendar Days to FIRE:   ${summary.projection.daysToFire.toLocaleString()}`);
    }
    if (summary.projection.workingDaysToFire !== null) {
      lines.push(`  Working Days to FIRE:    ${summary.projection.workingDaysToFire.toLocaleString()}`);
    }
  } else {
    lines.push("  FIRE target is NOT reached within the projection window (30 years).");
    lines.push("  The user may need to increase contributions, reduce their target, or adjust growth assumptions.");
  }
  lines.push("");

  // ── Lump Sum Solver ──────────────────────────────────────────────────────────
  //
  // Formula 10 applied: for a given target FIRE year T, work out P_required —
  // the starting portfolio value such that V(N) = FN after N = T - currentYear
  // years of compounding at real rate r with annual contribution C.
  //
  //   V(N) = P × (1+r)^N  +  C × (1+r/2) × [(1+r)^N - 1] / r
  //   Solve for P:
  //   P_required = [ FN  -  C × (1+r/2) × ((1+r)^N - 1) / r ]  /  (1+r)^N
  //   Lump_Sum   = P_required - P_current
  //
  // Pre-computing this table means any follow-up question like
  // "how much would I need to invest today to retire X years earlier?"
  // is answered directly from this output without another tool call.

  if (summary.projection.targetHitInWindow && summary.projection.fireYear !== null && realRate > 0) {
    const baseFireYear = summary.projection.fireYear;
    const baseN = baseFireYear - currentYear;

    lines.push("LUMP SUM SOLVER — capital needed today to retire N years earlier:");
    lines.push("──────────────────────────────────────────────────────────────────");
    lines.push("Formula: P_required = [ FN - C×(1+r/2)×((1+r)^N - 1)/r ] / (1+r)^N");
    lines.push(`         Lump_Sum = P_required - P_current (${formatCurrency(P, "GBP")})`);
    lines.push(
      `         FN = ${formatCurrency(FN, "GBP")}, r = ${realRate.toFixed(6)}, C = ${formatCurrency(C, "GBP")}/year`,
    );
    lines.push("");

    const maxEarlier = Math.min(5, baseN - 1);
    let anyValid = false;

    for (let yearsEarlier = 1; yearsEarlier <= maxEarlier; yearsEarlier++) {
      const targetYear = baseFireYear - yearsEarlier;
      const N = targetYear - currentYear;
      if (N <= 0) continue;

      const compoundFactor = Math.pow(1 + realRate, N);
      // Contribution stream future value using half-year approximation
      const contribFV = C > 0 && realRate > 0 ? (C * (1 + realRate / 2) * (compoundFactor - 1)) / realRate : C * N;
      const pRequired = (FN - contribFV) / compoundFactor;
      const lumpSum = pRequired - P;

      if (lumpSum <= 0) {
        lines.push(
          `  Retire ${yearsEarlier} year(s) earlier (${targetYear}, age ${targetYear - settings.yearOfBirth}): already on track — no lump sum needed.`,
        );
      } else {
        lines.push(
          `  Retire ${yearsEarlier} year(s) earlier (${targetYear}, age ${targetYear - settings.yearOfBirth}): invest ${formatCurrency(lumpSum, "GBP")} today`,
        );
      }
      anyValid = true;
    }

    if (!anyValid) {
      lines.push("  Not enough years in the projection window to calculate earlier retirement scenarios.");
    }

    lines.push("");
    lines.push("  To use this for a specific target year T:");
    lines.push("    N = T - currentYear");
    lines.push("    compoundFactor = (1 + r)^N");
    lines.push("    contribFV = C × (1 + r/2) × (compoundFactor - 1) / r");
    lines.push("    P_required = (FN - contribFV) / compoundFactor");
    lines.push("    Lump_Sum = P_required - P_current");
    lines.push("");
  }

  // ── Coast FIRE Analysis ─────────────────────────────────────────────────────
  //
  // Coast FIRE Q1: If the user stops contributing TODAY, when do they retire?
  //   n_coast = log(FN / P) / log(1 + r)
  //
  // Coast FIRE Q2: If the user wants to retire at target age T, when can they
  //   stop contributing?
  //   Required coast balance at year t = FN / (1 + r)^(T_year - currentYear - t)
  //   Find t = first year where accumulated portfolio (with contributions) >= that balance.

  lines.push("COAST FIRE ANALYSIS:");
  lines.push("─────────────────────");
  lines.push("Coast FIRE = the portfolio balance at which you can stop ALL contributions");
  lines.push("and your money will still grow to your FIRE Number by a target retirement date.");
  lines.push("");

  if (P <= 0 || FN <= 0 || realRate <= 0) {
    lines.push("  Cannot compute Coast FIRE: portfolio, FIRE Number, or real growth rate is zero.");
  } else {
    // ── Q1: Retire at natural coast age (stop contributing now) ──

    const nCoast = Math.log(FN / P) / Math.log(1 + realRate);
    const coastRetirementYear = currentYear + nCoast;
    const coastRetirementAge = Math.round(coastRetirementYear) - settings.yearOfBirth;

    lines.push("Q1 — If I stop contributing TODAY, when can I retire?");
    lines.push(`  Formula: n = log(FN / P) / log(1 + r)`);
    lines.push(
      `           n = log(${formatCurrency(FN, "GBP")} / ${formatCurrency(P, "GBP")}) / log(1 + ${realRate.toFixed(6)})`,
    );
    lines.push(`           n = ${nCoast.toFixed(2)} years from now`);
    lines.push(`  → Coast retirement year: ${Math.round(coastRetirementYear)}`);
    lines.push(`  → Coast retirement age:  ${coastRetirementAge}`);

    if (summary.projection.targetHitInWindow && summary.projection.fireYear !== null) {
      const yearsSaved = Math.round(coastRetirementYear) - summary.projection.fireYear;
      if (yearsSaved > 0) {
        lines.push(
          `  → This is ${yearsSaved} year(s) LATER than your current FIRE year (${summary.projection.fireYear}).`,
        );
        lines.push("    Coasting now means trading monthly contributions for working a bit longer.");
      } else if (yearsSaved === 0) {
        lines.push("    Coasting now results in the same FIRE year — contributions have minimal impact.");
      } else {
        lines.push(`  → Remarkably, this is ${Math.abs(yearsSaved)} year(s) EARLIER than your FIRE trajectory.`);
      }
    }
    lines.push("");

    // ── Q2: When can I START coasting to retire at my configured FIRE age? ──

    const targetRetirementAge = summary.settings.targetFireAge ?? summary.projection.fireAge;
    const targetRetirementYear = targetRetirementAge
      ? settings.yearOfBirth + targetRetirementAge
      : summary.projection.fireYear;

    if (targetRetirementYear && targetRetirementYear > currentYear) {
      const yearsToTarget = targetRetirementYear - currentYear;
      const requiredCoastBalance = FN / Math.pow(1 + realRate, yearsToTarget);

      lines.push(
        `Q2 — When can I start coasting to retire at age ${targetRetirementAge ?? "projected"} (${targetRetirementYear})?`,
      );
      lines.push(`  Formula: Required_Coast_Balance = FN / (1 + r)^n`);
      lines.push(
        `           Required_Coast_Balance = ${formatCurrency(FN, "GBP")} / (1 + ${realRate.toFixed(6)})^${yearsToTarget}`,
      );
      lines.push(`           Required_Coast_Balance = ${formatCurrency(requiredCoastBalance, "GBP")}`);
      lines.push("");
      lines.push(`  This means: if your portfolio reaches ${formatCurrency(requiredCoastBalance, "GBP")},`);
      lines.push(
        `  you can stop all contributions and still hit ${formatCurrency(FN, "GBP")} by age ${targetRetirementAge ?? targetRetirementYear}.`,
      );
      lines.push("");

      if (P >= requiredCoastBalance) {
        lines.push("  ✅ YOU HAVE ALREADY REACHED COAST FIRE!");
        lines.push(`     Your current portfolio (${formatCurrency(P, "GBP")}) already exceeds the`);
        lines.push(`     required Coast FIRE balance (${formatCurrency(requiredCoastBalance, "GBP")}).`);
        lines.push("     You can stop contributing today and still reach your target.");
      } else {
        // Iterate year-by-year with contributions to find coast year
        let balance = P;
        let coastYear: number | null = null;
        let coastAge: number | null = null;

        for (let t = 1; t <= 30; t++) {
          const yearsRemainingAtT = targetRetirementYear - (currentYear + t);
          if (yearsRemainingAtT <= 0) break;
          const requiredAtT = FN / Math.pow(1 + realRate, yearsRemainingAtT);

          // Grow balance one year with contributions (Formula 3)
          balance = balance * (1 + realRate) + C * (1 + realRate / 2);

          if (balance >= requiredAtT) {
            coastYear = currentYear + t;
            coastAge = coastYear - settings.yearOfBirth;
            break;
          }
        }

        if (coastYear !== null && coastAge !== null) {
          lines.push(`  → You can start coasting in: ${coastYear} (at age ${coastAge})`);
          lines.push(`  → That is ${coastYear - currentYear} year(s) from now.`);

          if (summary.projection.targetHitInWindow && summary.projection.fireYear !== null) {
            const yearsFree = summary.projection.fireYear - coastYear;
            if (yearsFree > 0) {
              lines.push(`  → You could enjoy ${yearsFree} year(s) of coast mode before full FIRE.`);
            }
          }
        } else {
          lines.push("  → Coast FIRE start year could not be determined within the 30-year window.");
          lines.push("    You may need to increase contributions or revisit your retirement age target.");
        }

        const coastGap = requiredCoastBalance - P;
        lines.push(`  Current gap to Coast FIRE Number: ${formatCurrency(coastGap, "GBP")}`);
        lines.push(`  (${((P / requiredCoastBalance) * 100).toFixed(1)}% of the way to Coast FIRE)`);
      }
      lines.push("");

      // ── Q2b: Custom retirement ages for quick reference ──

      lines.push(`Q2b — Coast FIRE balance required for common retirement ages:`);
      lines.push("  (Use Formula: Coast_Balance = FN / (1 + r)^(targetYear - currentYear))");
      lines.push("");

      const checkAges = [55, 57, 60, 65].filter(
        (a) => a > currentYear - settings.yearOfBirth && a !== targetRetirementAge,
      );

      for (const age of checkAges) {
        const year = settings.yearOfBirth + age;
        if (year <= currentYear) continue;
        const yrs = year - currentYear;
        const req = FN / Math.pow(1 + realRate, yrs);
        const achieved = P >= req;
        const pct = ((P / req) * 100).toFixed(1);
        lines.push(
          `  Retire at ${age} (${year}): need ${formatCurrency(req, "GBP")} — ${achieved ? "✅ already reached!" : `${pct}% there (gap: ${formatCurrency(req - P, "GBP")})`}`,
        );
      }
    } else {
      lines.push("Q2 — Skipped: target retirement year is not set or is in the past.");
    }
  }
  lines.push("");

  // ── Projection Milestones ────────────────────────────────────────────────────

  if (summary.projection.targetHitInWindow) {
    lines.push("KEY MILESTONES (from year-by-year projection):");
    lines.push("  25% of FIRE Number | 50% | 75% | 100% (FIRE)");
    lines.push("  [AI: calculate these using the year-by-year formula V(n) = V(n-1)×(1+r) + C×(1+r/2)]");
    lines.push(
      `  Starting from V(0) = ${formatCurrency(P, "GBP")}, r = ${realRate.toFixed(6)}, C = ${formatCurrency(C, "GBP")}/year`,
    );
  }
  lines.push("");

  return lines.join("\n");
}
