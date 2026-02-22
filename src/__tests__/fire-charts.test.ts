/**
 * Tests for the FIRE chart builder.
 *
 * Covers:
 * - buildBar: bar construction with filled/empty/target marker
 * - formatCompactValue: K/M/B suffix formatting for chart labels
 * - buildProjectionChart: full chart output with target line and FIRE marker
 * - buildDashboardMarkdown: complete dashboard markdown assembly
 *
 * All functions under test are pure (no Raycast imports, no side effects),
 * so no mocks are needed.
 */

import { buildBar, formatCompactValue, buildProjectionChart, buildDashboardMarkdown } from "../utils/fire-charts";
import { FireProjection, FireProjectionYear, FireSettings } from "../utils/fire-types";

// ──────────────────────────────────────────
// buildBar
// ──────────────────────────────────────────

describe("buildBar", () => {
  it("renders a fully filled bar when filledWidth equals totalWidth", () => {
    const bar = buildBar(10, 10, 5);
    expect(bar).toBe("██████████");
    expect(bar.length).toBe(10);
  });

  it("renders a fully empty bar when filledWidth is 0", () => {
    const bar = buildBar(0, 10, 5);
    expect(bar).toBe("░░░░░│░░░░");
    expect(bar.length).toBe(10);
  });

  it("shows the target marker at the correct position when not yet filled", () => {
    // 3 filled, 10 total, target at position 7
    const bar = buildBar(3, 10, 7);
    expect(bar[7]).toBe("│");
    expect(bar.substring(0, 3)).toBe("███");
    expect(bar.length).toBe(10);
  });

  it("hides the target marker when filled past it", () => {
    // 8 filled, 10 total, target at position 5
    const bar = buildBar(8, 10, 5);
    // Target at 5 should be absorbed into the filled portion
    expect(bar[5]).toBe("█");
    expect(bar.substring(0, 8)).toBe("████████");
    expect(bar.substring(8)).toBe("░░");
  });

  it("places target marker at position 0 correctly", () => {
    const bar = buildBar(0, 5, 0);
    expect(bar[0]).toBe("│");
    expect(bar).toBe("│░░░░");
  });

  it("handles target at the last position", () => {
    const bar = buildBar(0, 5, 4);
    expect(bar[4]).toBe("│");
    expect(bar).toBe("░░░░│");
  });

  it("handles single-character bar", () => {
    const bar = buildBar(0, 1, 0);
    expect(bar).toBe("│");
    expect(bar.length).toBe(1);
  });

  it("handles single-character filled bar", () => {
    const bar = buildBar(1, 1, 0);
    expect(bar).toBe("█");
    expect(bar.length).toBe(1);
  });

  it("preserves total width regardless of fill", () => {
    for (let fill = 0; fill <= 20; fill++) {
      const bar = buildBar(fill, 20, 10);
      expect(bar.length).toBe(20);
    }
  });

  it("target marker at exact boundary of fill (fillWidth == targetPos)", () => {
    // fill 5, target 5 — target not yet filled past, so marker shows
    const bar = buildBar(5, 10, 5);
    expect(bar[5]).toBe("│");
    expect(bar.substring(0, 5)).toBe("█████");
  });
});

// ──────────────────────────────────────────
// formatCompactValue
// ──────────────────────────────────────────

describe("formatCompactValue", () => {
  describe("GBP (£)", () => {
    it("formats billions", () => {
      expect(formatCompactValue(1_500_000_000, "GBP")).toBe("£1.5B");
    });

    it("formats millions", () => {
      expect(formatCompactValue(2_300_000, "GBP")).toBe("£2.3M");
    });

    it("formats millions with one decimal", () => {
      expect(formatCompactValue(1_000_000, "GBP")).toBe("£1.0M");
    });

    it("formats thousands", () => {
      expect(formatCompactValue(420_000, "GBP")).toBe("£420K");
    });

    it("formats small thousands", () => {
      expect(formatCompactValue(5_000, "GBP")).toBe("£5K");
    });

    it("formats hundreds", () => {
      expect(formatCompactValue(750, "GBP")).toBe("£750");
    });

    it("formats single digits", () => {
      expect(formatCompactValue(42, "GBP")).toBe("£42");
    });

    it("formats zero", () => {
      expect(formatCompactValue(0, "GBP")).toBe("£0");
    });

    it("formats very small values as zero", () => {
      expect(formatCompactValue(0.5, "GBP")).toBe("£0");
    });
  });

  describe("USD ($)", () => {
    it("formats millions", () => {
      expect(formatCompactValue(1_200_000, "USD")).toBe("$1.2M");
    });

    it("formats thousands", () => {
      expect(formatCompactValue(999_000, "USD")).toBe("$999K");
    });
  });

  describe("unknown currency", () => {
    it("uses currency code as prefix", () => {
      expect(formatCompactValue(500_000, "SEK")).toBe("SEK 500K");
    });
  });

  describe("negative values", () => {
    it("formats negative millions with sign", () => {
      expect(formatCompactValue(-2_500_000, "GBP")).toBe("-£2.5M");
    });

    it("formats negative thousands with sign", () => {
      expect(formatCompactValue(-350_000, "USD")).toBe("-$350K");
    });

    it("formats negative hundreds with sign", () => {
      expect(formatCompactValue(-42, "GBP")).toBe("-£42");
    });
  });

  describe("boundary values", () => {
    it("formats exactly 1 billion", () => {
      expect(formatCompactValue(1_000_000_000, "GBP")).toBe("£1.0B");
    });

    it("formats exactly 1 million", () => {
      expect(formatCompactValue(1_000_000, "GBP")).toBe("£1.0M");
    });

    it("formats exactly 1 thousand", () => {
      expect(formatCompactValue(1_000, "GBP")).toBe("£1K");
    });

    it("formats 999,999 as K (not M)", () => {
      expect(formatCompactValue(999_999, "GBP")).toBe("£1000K");
    });

    it("formats 999,999,999 as M (not B)", () => {
      expect(formatCompactValue(999_999_999, "GBP")).toBe("£1000.0M");
    });
  });
});

// ──────────────────────────────────────────
// buildProjectionChart
// ──────────────────────────────────────────

describe("buildProjectionChart", () => {
  /** Helper to build a simple year array */
  function makeYears(count: number, startValue: number, increment: number, targetValue: number): FireProjectionYear[] {
    const years: FireProjectionYear[] = [];
    for (let i = 0; i < count; i++) {
      const value = startValue + increment * i;
      years.push({
        year: 2025 + i,
        age: 35 + i,
        portfolioValue: value,
        isTargetHit: value >= targetValue,
        isSippAccessible: 35 + i >= 57,
      });
    }
    return years;
  }

  it("returns a message for empty years", () => {
    const chart = buildProjectionChart([], 1_000_000, "GBP", null);
    expect(chart).toBe("*No projection data*");
  });

  it("wraps the chart in a code block", () => {
    const years = makeYears(3, 200_000, 100_000, 1_000_000);
    const chart = buildProjectionChart(years, 1_000_000, "GBP", null);
    expect(chart).toContain("```");
    const lines = chart.split("\n");
    expect(lines[0]).toBe("```");
    // Find closing backticks
    const closingIdx = lines.findIndex((l, i) => i > 0 && l === "```");
    expect(closingIdx).toBeGreaterThan(0);
  });

  it("includes a line for each year", () => {
    const years = makeYears(5, 200_000, 50_000, 1_000_000);
    const chart = buildProjectionChart(years, 1_000_000, "GBP", null);
    expect(chart).toContain("2025");
    expect(chart).toContain("2026");
    expect(chart).toContain("2027");
    expect(chart).toContain("2028");
    expect(chart).toContain("2029");
  });

  it("includes value labels", () => {
    const years = makeYears(3, 200_000, 100_000, 1_000_000);
    const chart = buildProjectionChart(years, 1_000_000, "GBP", null);
    expect(chart).toContain("£200K");
    expect(chart).toContain("£300K");
    expect(chart).toContain("£400K");
  });

  it("includes the FIRE marker on the first year that hits the target", () => {
    const years = makeYears(10, 200_000, 100_000, 800_000);
    // Year 2031 (index 6): 200K + 600K = 800K → hits target
    const fireYear = 2031;
    const chart = buildProjectionChart(years, 800_000, "GBP", fireYear);
    expect(chart).toContain("🎯 FIRE!");
  });

  it("does not show FIRE marker when target is not hit", () => {
    const years = makeYears(5, 200_000, 50_000, 10_000_000);
    const chart = buildProjectionChart(years, 10_000_000, "GBP", null);
    expect(chart).not.toContain("🎯 FIRE!");
  });

  it("shows only one FIRE marker even when multiple years hit target", () => {
    const years = makeYears(10, 200_000, 100_000, 500_000);
    // Years from index 3 onward hit the target
    const fireYear = 2028;
    const chart = buildProjectionChart(years, 500_000, "GBP", fireYear);
    const markerCount = (chart.match(/🎯 FIRE!/g) || []).length;
    expect(markerCount).toBe(1);
  });

  it("includes a legend line with target value", () => {
    const years = makeYears(5, 200_000, 100_000, 500_000);
    const chart = buildProjectionChart(years, 500_000, "GBP", 2028);
    expect(chart).toContain("£500K target");
  });

  it("shows 'not yet reached' in legend when target is not hit", () => {
    const years = makeYears(3, 200_000, 50_000, 10_000_000);
    const chart = buildProjectionChart(years, 10_000_000, "GBP", null);
    expect(chart).toContain("not yet reached");
  });

  it("contains bar characters", () => {
    const years = makeYears(3, 200_000, 100_000, 1_000_000);
    const chart = buildProjectionChart(years, 1_000_000, "GBP", null);
    expect(chart).toContain("█");
    expect(chart).toContain("░");
  });

  it("handles all zero values gracefully", () => {
    const years: FireProjectionYear[] = [
      { year: 2025, age: 35, portfolioValue: 0, isTargetHit: false, isSippAccessible: false },
    ];
    const chart = buildProjectionChart(years, 0, "GBP", null);
    // maxValue is 0, should handle gracefully
    expect(chart).toBe("*No projection data*");
  });
});

// ──────────────────────────────────────────
// buildDashboardMarkdown
// ──────────────────────────────────────────

describe("buildDashboardMarkdown", () => {
  /** Minimal settings for testing */
  const testSettings: FireSettings = {
    targetValue: 1_000_000,
    withdrawalRate: 4,
    annualInflation: 2.5,
    annualGrowthRate: 7,
    yearOfBirth: 1990,
    holidayEntitlement: 25,
    sippAccessAge: 57,
    excludedAccountIds: [],
    contributions: [],
    updatedAt: "2025-01-15T00:00:00.000Z",
  };

  /** Build a minimal projection result */
  function makeProjection(opts: { targetHit: boolean; fireYear?: number; fireAge?: number }): FireProjection {
    const years: FireProjectionYear[] = [];
    for (let i = 0; i < 10; i++) {
      years.push({
        year: 2025 + i,
        age: 35 + i,
        portfolioValue: 200_000 + i * 100_000,
        isTargetHit: opts.targetHit && 200_000 + i * 100_000 >= 1_000_000,
        isSippAccessible: false,
      });
    }

    return {
      years,
      fireYear: opts.fireYear ?? null,
      fireAge: opts.fireAge ?? null,
      daysToFire: opts.targetHit ? 2920 : null,
      workingDaysToFire: opts.targetHit ? 2320 : null,
      currentPortfolioValue: 200_000,
      annualContribution: 24_000,
      realGrowthRate: 0.045,
      targetValue: 1_000_000,
      targetHitInWindow: opts.targetHit,
    };
  }

  it("includes the FIRE Dashboard header", () => {
    const projection = makeProjection({ targetHit: true, fireYear: 2033, fireAge: 43 });
    const md = buildDashboardMarkdown(projection, testSettings, "GBP", []);
    expect(md).toContain("# 🔥 FIRE Dashboard");
  });

  it("shows 'On track' message when target is hit", () => {
    const projection = makeProjection({ targetHit: true, fireYear: 2033, fireAge: 43 });
    const md = buildDashboardMarkdown(projection, testSettings, "GBP", []);
    expect(md).toContain("On track!");
    expect(md).toContain("2033");
    expect(md).toContain("age 43");
  });

  it("shows warning message when target is not hit", () => {
    const projection = makeProjection({ targetHit: false });
    const md = buildDashboardMarkdown(projection, testSettings, "GBP", []);
    expect(md).toContain("⚠️");
    expect(md).toContain("Target not reached");
  });

  it("includes the Portfolio Projection section", () => {
    const projection = makeProjection({ targetHit: true, fireYear: 2033, fireAge: 43 });
    const md = buildDashboardMarkdown(projection, testSettings, "GBP", []);
    expect(md).toContain("## Portfolio Projection");
  });

  it("includes assumptions line with growth, inflation, and withdrawal rate", () => {
    const projection = makeProjection({ targetHit: true, fireYear: 2033, fireAge: 43 });
    const md = buildDashboardMarkdown(projection, testSettings, "GBP", []);
    expect(md).toContain("Growth 7%");
    expect(md).toContain("Inflation 2.5%");
    expect(md).toContain("4.5% real return");
    expect(md).toContain("Withdrawal rate 4%");
  });

  it("shows contributions table when contributions exist", () => {
    const contributions = [
      {
        id: "c1",
        positionId: "p1",
        accountId: "a1",
        monthlyAmount: 500,
        displayName: "Vanguard S&P 500",
        accountName: "Vanguard ISA",
      },
      {
        id: "c2",
        positionId: "p2",
        accountId: "a1",
        monthlyAmount: 300,
        displayName: "Apple Inc.",
        accountName: "Vanguard ISA",
      },
    ];

    const projection = makeProjection({ targetHit: true, fireYear: 2033, fireAge: 43 });
    const md = buildDashboardMarkdown(projection, testSettings, "GBP", contributions);
    expect(md).toContain("## Monthly Contributions");
    expect(md).toContain("Vanguard S&P 500");
    expect(md).toContain("Apple Inc.");
    expect(md).toContain("Vanguard ISA");
    expect(md).toContain("| Position |");
    expect(md).toContain("| Account |");
    // Should show total row since there are multiple contributions
    expect(md).toContain("**Total**");
  });

  it("shows prompt message when no contributions exist", () => {
    const projection = makeProjection({ targetHit: true, fireYear: 2033, fireAge: 43 });
    const md = buildDashboardMarkdown(projection, testSettings, "GBP", []);
    expect(md).toContain("No monthly contributions configured");
    expect(md).toContain("Manage Contributions");
  });

  it("does not show Total row for single contribution", () => {
    const contributions = [
      {
        id: "c1",
        positionId: "p1",
        accountId: "a1",
        monthlyAmount: 500,
        displayName: "VUSA.L",
        accountName: "ISA",
      },
    ];

    const projection = makeProjection({ targetHit: true, fireYear: 2033, fireAge: 43 });
    const md = buildDashboardMarkdown(projection, testSettings, "GBP", contributions);
    expect(md).not.toContain("**Total**");
  });

  it("uses the correct currency symbol", () => {
    const projection = makeProjection({ targetHit: true, fireYear: 2033, fireAge: 43 });
    const mdGBP = buildDashboardMarkdown(projection, testSettings, "GBP", []);
    expect(mdGBP).toContain("£");

    const mdUSD = buildDashboardMarkdown(projection, testSettings, "USD", []);
    expect(mdUSD).toContain("$");
  });

  it("contains the projection chart code block", () => {
    const projection = makeProjection({ targetHit: true, fireYear: 2033, fireAge: 43 });
    const md = buildDashboardMarkdown(projection, testSettings, "GBP", []);
    // Chart is rendered inside a code block
    expect(md).toContain("```");
    expect(md).toContain("2025");
    expect(md).toContain("█");
  });

  it("handles different growth/inflation combinations in assumptions", () => {
    const customSettings: FireSettings = {
      ...testSettings,
      annualGrowthRate: 10,
      annualInflation: 3,
      withdrawalRate: 3.5,
    };
    const projection = makeProjection({ targetHit: true, fireYear: 2033, fireAge: 43 });
    const md = buildDashboardMarkdown(projection, customSettings, "GBP", []);
    expect(md).toContain("Growth 10%");
    expect(md).toContain("Inflation 3%");
    expect(md).toContain("7.0% real return");
    expect(md).toContain("Withdrawal rate 3.5%");
  });
});
