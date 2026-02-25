/**
 * Tests for Debt SVG Visualisations (Roadmap 7.1).
 *
 * Covers:
 *   - buildProjectionSVG: debt frame overlay on growth chart bars
 *   - buildDebtProjectionSVG: standalone debt repayment chart (principal + interest)
 *   - computeChartBars: debt value injection into growth chart data
 *   - computeDebtChartBars: debt projection bar decomposition (principal/interest split)
 *   - buildDebtChartSummary: human-readable debt summary
 *   - buildDashboardMarkdown: debt SVG integration in dashboard output
 *
 * All functions under test are pure (no Raycast imports, no side effects),
 * so no mocks are needed.
 */

import { buildProjectionSVG, ChartBar, ChartConfig } from "../utils/fire-svg";
import { buildDebtProjectionSVG, DebtChartBar, DebtChartConfig } from "../utils/fire-svg-debt";
import {
  computeChartBars,
  computeDebtChartBars,
  buildDebtChartSummary,
  buildDashboardMarkdown,
  formatCompactValue,
  DebtPortfolioData,
  SplitPortfolioData,
} from "../utils/fire-charts";
import { FireProjection, FireProjectionYear, FireSettings } from "../utils/fire-types";

// ──────────────────────────────────────────
// Test Helpers
// ──────────────────────────────────────────

function makeProjection(opts: {
  currentValue?: number;
  targetValue?: number;
  annualContribution?: number;
  realGrowthRate?: number;
  numYears?: number;
  targetHit?: boolean;
  fireYear?: number | null;
  fireAge?: number | null;
  currentPortfolioValue?: number;
  yearOfBirth?: number;
}): FireProjection {
  const startValue = opts.currentValue ?? 100_000;
  const targetValue = opts.targetValue ?? 1_000_000;
  const contribution = opts.annualContribution ?? 12_000;
  const rate = opts.realGrowthRate ?? 0.045;
  const numYears = opts.numYears ?? 5;
  const yearOfBirth = opts.yearOfBirth ?? 1990;
  const currentYear = new Date().getFullYear();

  const years: FireProjectionYear[] = [];
  let value = startValue;

  for (let i = 0; i < numYears; i++) {
    const portfolioValue = i === 0 ? value : value * (1 + rate) + contribution * (1 + rate / 2);
    value = portfolioValue;
    years.push({
      year: currentYear + i,
      age: currentYear + i - yearOfBirth,
      portfolioValue,
      isTargetHit: opts.targetHit !== undefined ? opts.targetHit && i >= numYears - 2 : portfolioValue >= targetValue,
      isSippAccessible: currentYear + i - yearOfBirth >= 57,
    });
  }

  const hit = opts.targetHit ?? years.some((y) => y.isTargetHit);

  return {
    years,
    fireYear:
      opts.fireYear !== undefined ? opts.fireYear : hit ? (years.find((y) => y.isTargetHit)?.year ?? null) : null,
    fireAge: opts.fireAge !== undefined ? opts.fireAge : hit ? (years.find((y) => y.isTargetHit)?.age ?? null) : null,
    daysToFire: null,
    workingDaysToFire: null,
    currentPortfolioValue: opts.currentPortfolioValue ?? startValue,
    annualContribution: contribution,
    realGrowthRate: rate,
    targetValue,
    targetHitInWindow: hit,
  };
}

const defaultSettings: FireSettings = {
  targetValue: 1_000_000,
  withdrawalRate: 4,
  annualInflation: 2.5,
  annualGrowthRate: 7,
  yearOfBirth: 1990,
  holidayEntitlement: 25,
  sippAccessAge: 57,
  excludedAccountIds: [],
  contributions: [],
  updatedAt: new Date().toISOString(),
};

function makeSampleDebtBars(numBars: number = 3): DebtChartBar[] {
  const bars: DebtChartBar[] = [];
  const currentYear = new Date().getFullYear();
  let principal = 12000;
  let interest = 3000;

  for (let i = 0; i < numBars; i++) {
    const totalDebt = Math.max(0, principal + interest);
    const isDebtFreeYear = totalDebt <= 0 && i > 0;
    bars.push({
      year: currentYear + i,
      label: formatCompactValue(totalDebt, "GBP"),
      totalDebt,
      principalRemaining: Math.max(0, principal),
      interestInBalance: Math.max(0, interest),
      principalLabel: formatCompactValue(Math.max(0, principal), "GBP"),
      interestLabel: interest > 0 ? formatCompactValue(Math.max(0, interest), "GBP") : "",
      cumulativeInterest: i * 500,
      isDebtFreeYear,
    });
    principal -= 5000;
    interest -= 1000;
  }

  return bars;
}

function makeSampleGrowthBarsWithDebt(): ChartBar[] {
  const currentYear = new Date().getFullYear();
  return [
    {
      year: currentYear,
      label: "£100K",
      totalValue: 100_000,
      baseGrowthValue: 80_000,
      contributionValue: 20_000,
      isFireYear: false,
      baseLabel: "£80K",
      contribLabel: "£20K",
      debtValue: 30_000,
      debtLabel: "£30K",
    },
    {
      year: currentYear + 1,
      label: "£120K",
      totalValue: 120_000,
      baseGrowthValue: 96_000,
      contributionValue: 24_000,
      isFireYear: false,
      baseLabel: "£96K",
      contribLabel: "£24K",
      debtValue: 30_000,
      debtLabel: "£30K",
    },
    {
      year: currentYear + 2,
      label: "£140K",
      totalValue: 140_000,
      baseGrowthValue: 112_000,
      contributionValue: 28_000,
      isFireYear: true,
      baseLabel: "£112K",
      contribLabel: "£28K",
      debtValue: 30_000,
      debtLabel: "£30K",
    },
  ];
}

// ──────────────────────────────────────────
// Growth SVG: Debt Frame Overlay
// ──────────────────────────────────────────

describe("buildProjectionSVG — debt frame overlay on growth chart", () => {
  const defaultConfig: ChartConfig = {
    targetValue: 200_000,
    targetLabel: "£200K",
    theme: "dark",
  };

  it("renders debt frame rect elements when debtValue is present on a bar", () => {
    const bars = makeSampleGrowthBarsWithDebt();
    const svg = buildProjectionSVG(bars, defaultConfig);

    // Should contain a debt frame rect (class "c-debt") with stroke, no fill
    expect(svg).toContain('class="c-debt"');
    expect(svg).toContain('fill="none"');
  });

  it("does NOT render hatching pattern or fill — debt is a frame (stroke only)", () => {
    const bars = makeSampleGrowthBarsWithDebt();
    const svg = buildProjectionSVG(bars, defaultConfig);

    // No hatching pattern
    expect(svg).not.toContain('id="debt-hatch"');
    expect(svg).not.toContain("url(#debt-hatch)");
    // The debt rects should have fill="none"
    const debtRectMatches = svg.match(/class="c-debt"[^>]*/g) ?? [];
    for (const match of debtRectMatches) {
      expect(match).toContain('fill="none"');
    }
  });

  it("does not render debt elements when no bar has debtValue", () => {
    const bars: ChartBar[] = [
      {
        year: 2025,
        label: "£100K",
        totalValue: 100_000,
        baseGrowthValue: 80_000,
        contributionValue: 20_000,
        isFireYear: false,
      },
    ];
    const svg = buildProjectionSVG(bars, defaultConfig);

    expect(svg).not.toContain('class="c-debt"');
  });

  it("renders debt frame on ALL bars, not just the first", () => {
    const bars = makeSampleGrowthBarsWithDebt();
    const svg = buildProjectionSVG(bars, defaultConfig);

    // All 3 bars have debtValue, so there should be 3 debt frame rects
    // Plus 1 legend swatch = 4 total with class c-debt
    const debtMatches = svg.match(/class="c-debt"/g);
    // 3 bar frames + 1 legend swatch = 4
    expect(debtMatches?.length).toBe(4);
  });

  it("shows the debt label in RED at the bar's right end", () => {
    const bars = makeSampleGrowthBarsWithDebt();
    const svg = buildProjectionSVG(bars, defaultConfig);

    // The debt label class should be present
    expect(svg).toContain('class="c-debt-lbl"');
    // Should contain the debt value
    expect(svg).toContain("£30K");
    // Debt labels should use font-weight 600 (bold)
    expect(svg).toMatch(/class="c-debt-lbl"[^>]*font-weight="600"/);
  });

  it("includes Debt in the legend when debt is present", () => {
    const bars = makeSampleGrowthBarsWithDebt();
    const svg = buildProjectionSVG(bars, defaultConfig);

    expect(svg).toContain(">Debt</text>");
  });

  it("legend Debt swatch uses stroke outline, not fill", () => {
    const bars = makeSampleGrowthBarsWithDebt();
    const svg = buildProjectionSVG(bars, defaultConfig);

    // Find the legend debt swatch — it's a rect with class c-debt in the legend area
    // It should have stroke and fill="none"
    const legendDebtMatch = svg.match(/<rect class="c-debt"[^>]*?fill="none"[^>]*?>/);
    expect(legendDebtMatch).not.toBeNull();
  });

  it("does not include Debt in the legend when no debt is present", () => {
    const bars: ChartBar[] = [
      {
        year: 2025,
        label: "£100K",
        totalValue: 100_000,
        baseGrowthValue: 80_000,
        contributionValue: 20_000,
        isFireYear: false,
      },
    ];
    const svg = buildProjectionSVG(bars, defaultConfig);

    expect(svg).not.toContain(">Debt</text>");
  });

  it("handles debt less than totalValue (frame fits within equity bar)", () => {
    const bars: ChartBar[] = [
      {
        year: 2025,
        label: "£100K",
        totalValue: 100_000,
        baseGrowthValue: 80_000,
        contributionValue: 20_000,
        isFireYear: false,
        debtValue: 30_000,
        debtLabel: "£30K",
      },
    ];
    const svg = buildProjectionSVG(bars, defaultConfig);

    expect(svg).toContain('class="c-debt"');
    // Should NOT have a netLabel since debt < totalValue
    expect(svg).not.toContain("-£");
  });

  it("handles debt exceeding totalValue (frame extends rightward, negative net label)", () => {
    const bars: ChartBar[] = [
      {
        year: 2025,
        label: "£50K",
        totalValue: 50_000,
        baseGrowthValue: 40_000,
        contributionValue: 10_000,
        isFireYear: false,
        debtValue: 80_000,
        debtLabel: "£80K",
        netLabel: "-£30K",
      },
    ];
    const svg = buildProjectionSVG(bars, defaultConfig);

    expect(svg).toContain('class="c-debt"');
    // Should show the negative net label on the right
    expect(svg).toContain("-£30K");
  });

  it("handles debt exactly equal to totalValue", () => {
    const bars: ChartBar[] = [
      {
        year: 2025,
        label: "£100K",
        totalValue: 100_000,
        baseGrowthValue: 80_000,
        contributionValue: 20_000,
        isFireYear: false,
        debtValue: 100_000,
        debtLabel: "£100K",
      },
    ];
    const svg = buildProjectionSVG(bars, defaultConfig);

    expect(svg).toContain('class="c-debt"');
  });

  it("scales properly when debt exceeds totalValue (maxValue accounts for debt)", () => {
    const smallEquity: ChartBar[] = [
      {
        year: 2025,
        label: "£10K",
        totalValue: 10_000,
        baseGrowthValue: 10_000,
        contributionValue: 0,
        isFireYear: false,
        debtValue: 100_000,
        debtLabel: "£100K",
        netLabel: "-£90K",
      },
    ];
    const config: ChartConfig = {
      targetValue: 50_000,
      targetLabel: "£50K",
      theme: "dark",
    };

    const svg = buildProjectionSVG(smallEquity, config);
    expect(svg).toBeTruthy();
    expect(svg).toContain("<svg");
    expect(svg).toContain('class="c-debt"');
  });

  it("renders debt CSS class in the theme style block (stroke-based, not fill)", () => {
    const bars = makeSampleGrowthBarsWithDebt();
    const svg = buildProjectionSVG(bars, defaultConfig);

    expect(svg).toContain(".c-debt {");
    expect(svg).toContain(".c-debt-lbl {");
    // Debt CSS should use stroke, not fill
    expect(svg).toMatch(/\.c-debt\s*\{[^}]*stroke:/);
    expect(svg).toMatch(/\.c-debt\s*\{[^}]*fill:\s*none/);
  });

  it("includes debt colour in both light and dark CSS media queries", () => {
    const bars = makeSampleGrowthBarsWithDebt();
    const svg = buildProjectionSVG(bars, defaultConfig);

    const darkMatch = svg.match(/prefers-color-scheme: dark[\s\S]*?\.c-debt\s*\{/);
    const lightMatch = svg.match(/prefers-color-scheme: light[\s\S]*?\.c-debt\s*\{/);
    expect(darkMatch).not.toBeNull();
    expect(lightMatch).not.toBeNull();
  });

  it("never emits rgba() in SVG output with debt bars (SVG 1.1 compat)", () => {
    const bars = makeSampleGrowthBarsWithDebt();
    const svg = buildProjectionSVG(bars, defaultConfig);

    expect(svg).not.toMatch(/rgba\(/);
  });

  it("does not suppress base/contrib labels when debt is within equity", () => {
    const bars: ChartBar[] = [
      {
        year: 2025,
        label: "£100K",
        totalValue: 100_000,
        baseGrowthValue: 80_000,
        contributionValue: 20_000,
        isFireYear: false,
        baseLabel: "£80K",
        contribLabel: "£20K",
        debtValue: 30_000,
        debtLabel: "£30K",
      },
    ];
    const svg = buildProjectionSVG(bars, defaultConfig);

    // Base and contrib labels should still be present since debt is just a frame
    expect(svg).toContain('class="c-base-lbl"');
    expect(svg).toContain('class="c-contrib-lbl"');
  });

  it("omits explicit width and height attributes (viewBox only)", () => {
    const bars = makeSampleGrowthBarsWithDebt();
    const svg = buildProjectionSVG(bars, defaultConfig);

    // Should have viewBox
    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);
    // Should NOT have width= or height= on the root <svg> element
    const svgTag = svg.match(/<svg[^>]*>/)?.[0] ?? "";
    expect(svgTag).not.toMatch(/\bwidth="/);
    expect(svgTag).not.toMatch(/\bheight="/);
  });
});

// ──────────────────────────────────────────
// Debt Projection SVG (standalone chart — principal + interest)
// ──────────────────────────────────────────

describe("buildDebtProjectionSVG", () => {
  const defaultDebtConfig: DebtChartConfig = {
    startingDebt: 15_000,
    startingDebtLabel: "£15K",
    theme: "dark",
    title: "Debt Repayment Projection",
  };

  it("returns empty string for empty bars", () => {
    expect(buildDebtProjectionSVG([], defaultDebtConfig)).toBe("");
  });

  it("returns a valid SVG document", () => {
    const bars = makeSampleDebtBars();
    const svg = buildDebtProjectionSVG(bars, defaultDebtConfig);

    expect(svg).toMatch(/^<svg/);
    expect(svg).toMatch(/<\/svg>$/);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it("omits explicit width and height attributes (viewBox only)", () => {
    const bars = makeSampleDebtBars();
    const svg = buildDebtProjectionSVG(bars, defaultDebtConfig);

    expect(svg).toMatch(/viewBox="0 0 \d+ \d+"/);
    const svgTag = svg.match(/<svg[^>]*>/)?.[0] ?? "";
    expect(svgTag).not.toMatch(/\bwidth="/);
    expect(svgTag).not.toMatch(/\bheight="/);
  });

  it("includes the chart title when provided", () => {
    const bars = makeSampleDebtBars();
    const svg = buildDebtProjectionSVG(bars, defaultDebtConfig);

    expect(svg).toContain("Debt Repayment Projection");
  });

  it("embeds a <defs><style> block with prefers-color-scheme media queries", () => {
    const bars = makeSampleDebtBars();
    const svg = buildDebtProjectionSVG(bars, defaultDebtConfig);

    expect(svg).toContain("<defs>");
    expect(svg).toContain("<style>");
    expect(svg).toContain("prefers-color-scheme: light");
    expect(svg).toContain("prefers-color-scheme: dark");
  });

  it("contains year labels for each bar", () => {
    const bars = makeSampleDebtBars();
    const svg = buildDebtProjectionSVG(bars, defaultDebtConfig);

    for (const bar of bars) {
      expect(svg).toContain(`>${bar.year}</text>`);
    }
  });

  it("contains bar tracks for each row", () => {
    const bars = makeSampleDebtBars();
    const svg = buildDebtProjectionSVG(bars, defaultDebtConfig);

    const trackMatches = svg.match(/class="d-track"/g);
    expect(trackMatches).toHaveLength(bars.length);
  });

  it("renders principal bars (left segment, red)", () => {
    const bars = makeSampleDebtBars();
    const svg = buildDebtProjectionSVG(bars, defaultDebtConfig);

    expect(svg).toContain('class="d-principal"');
  });

  it("renders interest bars (right segment, orange)", () => {
    const bars = makeSampleDebtBars();
    const svg = buildDebtProjectionSVG(bars, defaultDebtConfig);

    expect(svg).toContain('class="d-interest"');
  });

  it("highlights the debt-free year row", () => {
    const currentYear = new Date().getFullYear();
    const bars: DebtChartBar[] = [
      {
        year: currentYear,
        label: "£5K",
        totalDebt: 5_000,
        principalRemaining: 4_000,
        interestInBalance: 1_000,
        principalLabel: "£4K",
        interestLabel: "£1K",
        cumulativeInterest: 200,
        isDebtFreeYear: false,
      },
      {
        year: currentYear + 1,
        label: "£0",
        totalDebt: 0,
        principalRemaining: 0,
        interestInBalance: 0,
        principalLabel: "",
        interestLabel: "",
        cumulativeInterest: 300,
        isDebtFreeYear: true,
      },
    ];

    const svg = buildDebtProjectionSVG(bars, defaultDebtConfig);

    expect(svg).toContain('class="d-free-hl"');
    expect(svg).toContain("Debt Free! 🎉");
  });

  it("shows interest label ON the bar, not on the RHS", () => {
    const bars = makeSampleDebtBars();
    const svg = buildDebtProjectionSVG(bars, defaultDebtConfig);

    // Interest label class should be present
    expect(svg).toContain('class="d-interest-lbl"');

    // The RHS value labels should NOT contain "int." text
    // (interest is displayed on the bar, not flying off to the right)
    const rhsLabels = svg.match(/class="d-muted"[^>]*>[^<]*int\.[^<]*/g);
    expect(rhsLabels).toBeNull();
  });

  it("includes a legend with Principal and Interest entries", () => {
    const bars = makeSampleDebtBars();
    const svg = buildDebtProjectionSVG(bars, defaultDebtConfig);

    expect(svg).toContain(">Principal</text>");
    expect(svg).toContain(">Interest</text>");
  });

  it("includes Debt Free in legend when debt-free year exists", () => {
    const currentYear = new Date().getFullYear();
    const bars: DebtChartBar[] = [
      {
        year: currentYear,
        label: "£5K",
        totalDebt: 5_000,
        principalRemaining: 5_000,
        interestInBalance: 0,
        principalLabel: "£5K",
        interestLabel: "",
        cumulativeInterest: 0,
        isDebtFreeYear: false,
      },
      {
        year: currentYear + 1,
        label: "£0",
        totalDebt: 0,
        principalRemaining: 0,
        interestInBalance: 0,
        principalLabel: "",
        interestLabel: "",
        cumulativeInterest: 200,
        isDebtFreeYear: true,
      },
    ];

    const svg = buildDebtProjectionSVG(bars, defaultDebtConfig);
    expect(svg).toContain("Debt Free");
  });

  it("embeds tooltip when provided", () => {
    const bars = makeSampleDebtBars();
    const config: DebtChartConfig = {
      ...defaultDebtConfig,
      tooltip: "Test tooltip content",
    };

    const svg = buildDebtProjectionSVG(bars, config);
    expect(svg).toContain("<title>Test tooltip content</title>");
  });

  it("escapes XML entities in tooltip", () => {
    const bars = makeSampleDebtBars();
    const config: DebtChartConfig = {
      ...defaultDebtConfig,
      tooltip: "Value < £10K & APR > 20%",
    };

    const svg = buildDebtProjectionSVG(bars, config);
    expect(svg).toContain("&lt;");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&gt;");
  });

  it("height scales with number of bars", () => {
    const shortBars = makeSampleDebtBars(2);
    const longBars = makeSampleDebtBars(5);

    const svgShort = buildDebtProjectionSVG(shortBars, defaultDebtConfig);
    const svgLong = buildDebtProjectionSVG(longBars, defaultDebtConfig);

    const heightShort = parseInt(svgShort.match(/viewBox="0 0 \d+ (\d+)"/)?.[1] ?? "0");
    const heightLong = parseInt(svgLong.match(/viewBox="0 0 \d+ (\d+)"/)?.[1] ?? "0");

    expect(heightLong).toBeGreaterThan(heightShort);
  });

  it("never emits rgba() in SVG output (SVG 1.1 compat)", () => {
    const bars = makeSampleDebtBars();
    const svg = buildDebtProjectionSVG(bars, defaultDebtConfig);

    expect(svg).not.toMatch(/rgba\(/);
  });

  it("returns empty string when maxValue is zero (all debts are zero)", () => {
    const currentYear = new Date().getFullYear();
    const zeroBars: DebtChartBar[] = [
      {
        year: currentYear,
        label: "£0",
        totalDebt: 0,
        principalRemaining: 0,
        interestInBalance: 0,
        principalLabel: "",
        interestLabel: "",
        cumulativeInterest: 0,
        isDebtFreeYear: false,
      },
    ];
    const config: DebtChartConfig = { ...defaultDebtConfig, startingDebt: 0 };

    const svg = buildDebtProjectionSVG(zeroBars, config);
    expect(svg).toBe("");
  });

  it("applies light theme palette for inline fallback attributes when theme is light", () => {
    const bars = makeSampleDebtBars();
    const lightConfig: DebtChartConfig = { ...defaultDebtConfig, theme: "light" };
    const svg = buildDebtProjectionSVG(bars, lightConfig);

    // Light background should be white
    expect(svg).toContain('fill="#FFFFFF"');
  });

  it("applies dark theme palette for inline fallback attributes when theme is dark", () => {
    const bars = makeSampleDebtBars();
    const svg = buildDebtProjectionSVG(bars, defaultDebtConfig);

    // Dark background
    expect(svg).toContain('fill="#1C1C1E"');
  });

  it("renders inline principal labels when wide enough", () => {
    const currentYear = new Date().getFullYear();
    const bars: DebtChartBar[] = [
      {
        year: currentYear,
        label: "£100K",
        totalDebt: 100_000,
        principalRemaining: 80_000,
        interestInBalance: 20_000,
        principalLabel: "£80K",
        interestLabel: "£20K",
        cumulativeInterest: 0,
        isDebtFreeYear: false,
      },
    ];
    const config: DebtChartConfig = { ...defaultDebtConfig, startingDebt: 100_000 };

    const svg = buildDebtProjectionSVG(bars, config);
    expect(svg).toContain('class="d-principal-lbl"');
    expect(svg).toContain('class="d-interest-lbl"');
  });

  it("does not render principal bar when totalDebt is zero for a row", () => {
    const currentYear = new Date().getFullYear();
    const bars: DebtChartBar[] = [
      {
        year: currentYear,
        label: "£10K",
        totalDebt: 10_000,
        principalRemaining: 8_000,
        interestInBalance: 2_000,
        principalLabel: "£8K",
        interestLabel: "£2K",
        cumulativeInterest: 0,
        isDebtFreeYear: false,
      },
      {
        year: currentYear + 1,
        label: "£0",
        totalDebt: 0,
        principalRemaining: 0,
        interestInBalance: 0,
        principalLabel: "",
        interestLabel: "",
        cumulativeInterest: 500,
        isDebtFreeYear: true,
      },
    ];
    const svg = buildDebtProjectionSVG(bars, defaultDebtConfig);

    // The bar track exists for both rows
    const trackMatches = svg.match(/class="d-track"/g);
    expect(trackMatches).toHaveLength(2);

    // But principal rect only exists for the first
    const principalMatches = svg.match(/class="d-principal"/g);
    expect(principalMatches).toHaveLength(1);
  });

  it("RHS value labels show only total debt, no interest suffix", () => {
    const bars = makeSampleDebtBars();
    const svg = buildDebtProjectionSVG(bars, defaultDebtConfig);

    // No "int." should appear in the muted (RHS) value labels
    const mutedLabels = svg.match(/class="d-muted"[^>]*>[^<]*/g) ?? [];
    for (const label of mutedLabels) {
      expect(label).not.toContain("int.");
    }
  });
});

// ──────────────────────────────────────────
// computeChartBars — debt injection
// ──────────────────────────────────────────

describe("computeChartBars with debt", () => {
  it("returns bars without debt fields when totalDebt is 0", () => {
    const projection = makeProjection({ currentValue: 100_000, numYears: 3 });
    const bars = computeChartBars(projection, "GBP", 0);

    expect(bars).toHaveLength(3);
    for (const bar of bars) {
      expect(bar.debtValue).toBeUndefined();
      expect(bar.debtLabel).toBeUndefined();
      expect(bar.netLabel).toBeUndefined();
    }
  });

  it("injects debtValue on ALL bars (not just the first)", () => {
    const projection = makeProjection({ currentValue: 100_000, numYears: 4 });
    const bars = computeChartBars(projection, "GBP", 20_000);

    for (const bar of bars) {
      expect(bar.debtValue).toBe(20_000);
      expect(bar.debtLabel).toBeTruthy();
    }
  });

  it("sets netLabel when debt exceeds totalValue on any bar", () => {
    const projection = makeProjection({ currentValue: 30_000, numYears: 3 });
    const bars = computeChartBars(projection, "GBP", 50_000);

    // First bar: Debt (50K) > portfolio value (30K), so netLabel should be negative
    expect(bars[0].netLabel).toBeTruthy();
    expect(bars[0].netLabel).toContain("-");
  });

  it("does not set netLabel when debt is less than totalValue", () => {
    const projection = makeProjection({ currentValue: 100_000, numYears: 3 });
    const bars = computeChartBars(projection, "GBP", 20_000);

    // All bars should have totalValue > 20K, so no netLabel
    for (const bar of bars) {
      expect(bar.netLabel).toBeUndefined();
    }
  });

  it("preserves existing bar properties (year, label, isFireYear etc.) with debt", () => {
    const projection = makeProjection({
      currentValue: 50_000,
      numYears: 3,
      targetValue: 200_000,
    });
    const barsWithoutDebt = computeChartBars(projection, "GBP", 0);
    const barsWithDebt = computeChartBars(projection, "GBP", 10_000);

    expect(barsWithDebt).toHaveLength(barsWithoutDebt.length);

    for (let i = 0; i < barsWithDebt.length; i++) {
      expect(barsWithDebt[i].year).toBe(barsWithoutDebt[i].year);
      expect(barsWithDebt[i].totalValue).toBe(barsWithoutDebt[i].totalValue);
      expect(barsWithDebt[i].baseGrowthValue).toBe(barsWithoutDebt[i].baseGrowthValue);
      expect(barsWithDebt[i].contributionValue).toBe(barsWithoutDebt[i].contributionValue);
    }
  });

  it("handles zero portfolio value with non-zero debt", () => {
    const projection = makeProjection({ currentValue: 0, numYears: 2, targetValue: 100_000 });
    const bars = computeChartBars(projection, "GBP", 10_000);

    expect(bars[0].debtValue).toBe(10_000);
    expect(bars[0].netLabel).toBeTruthy();
    expect(bars[0].netLabel).toContain("-");
  });

  it("debt frame shrinks proportionally as portfolio grows over time", () => {
    const projection = makeProjection({ currentValue: 50_000, numYears: 5, annualContribution: 20_000 });
    const bars = computeChartBars(projection, "GBP", 30_000);

    // Debt is constant at 30K across all bars
    for (const bar of bars) {
      expect(bar.debtValue).toBe(30_000);
    }

    // Portfolio grows, so the ratio debtValue/totalValue decreases
    const firstRatio = bars[0].debtValue! / bars[0].totalValue;
    const lastRatio = bars[bars.length - 1].debtValue! / bars[bars.length - 1].totalValue;
    expect(lastRatio).toBeLessThan(firstRatio);
  });
});

// ──────────────────────────────────────────
// computeDebtChartBars
// ──────────────────────────────────────────

describe("computeDebtChartBars", () => {
  const sampleDebtData: DebtPortfolioData = {
    totalDebt: 15_000,
    positions: [
      { name: "Credit Card", currentBalance: 5_000, apr: 19.9, monthlyRepayment: 300 },
      { name: "Student Loan", currentBalance: 10_000, apr: 5.5, monthlyRepayment: 200 },
    ],
  };

  it("returns empty array for empty positions", () => {
    const projection = makeProjection({ numYears: 5 });
    const bars = computeDebtChartBars({ totalDebt: 0, positions: [] }, projection, "GBP");

    expect(bars).toEqual([]);
  });

  it("returns empty array when totalDebt is zero", () => {
    const projection = makeProjection({ numYears: 5 });
    const bars = computeDebtChartBars(
      { totalDebt: 0, positions: [{ name: "Old", currentBalance: 0, apr: 0, monthlyRepayment: 0 }] },
      projection,
      "GBP",
    );

    expect(bars).toEqual([]);
  });

  it("first bar is the current year with the starting debt (all principal, no interest)", () => {
    const projection = makeProjection({ numYears: 5 });
    const bars = computeDebtChartBars(sampleDebtData, projection, "GBP");

    expect(bars.length).toBeGreaterThan(0);
    expect(bars[0].year).toBe(new Date().getFullYear());
    expect(bars[0].totalDebt).toBe(15_000);
    expect(bars[0].principalRemaining).toBe(15_000);
    expect(bars[0].interestInBalance).toBe(0);
    expect(bars[0].cumulativeInterest).toBe(0);
    expect(bars[0].isDebtFreeYear).toBe(false);
  });

  it("total debt decreases over time with repayments", () => {
    const projection = makeProjection({ numYears: 10 });
    const bars = computeDebtChartBars(sampleDebtData, projection, "GBP");

    // Debt should generally decline (ignoring first bar which is current state)
    for (let i = 2; i < bars.length; i++) {
      if (bars[i].totalDebt > 0) {
        expect(bars[i].totalDebt).toBeLessThan(bars[i - 1].totalDebt > 0 ? bars[i - 1].totalDebt : Infinity);
      }
    }
  });

  it("principalRemaining + interestInBalance = totalDebt for each bar", () => {
    const projection = makeProjection({ numYears: 10 });
    const bars = computeDebtChartBars(sampleDebtData, projection, "GBP");

    for (const bar of bars) {
      expect(bar.principalRemaining + bar.interestInBalance).toBeCloseTo(bar.totalDebt, 0);
    }
  });

  it("marks the first zero-debt year as isDebtFreeYear", () => {
    const fastPayoff: DebtPortfolioData = {
      totalDebt: 5_000,
      positions: [{ name: "Quick Loan", currentBalance: 5_000, apr: 0, monthlyRepayment: 500 }],
    };
    const projection = makeProjection({ numYears: 5 });
    const bars = computeDebtChartBars(fastPayoff, projection, "GBP");

    const freeYears = bars.filter((b) => b.isDebtFreeYear);
    expect(freeYears).toHaveLength(1);
    expect(freeYears[0].totalDebt).toBe(0);
  });

  it("cumulative interest increases over time while debt is active", () => {
    const projection = makeProjection({ numYears: 5 });
    const highAprDebt: DebtPortfolioData = {
      totalDebt: 10_000,
      positions: [{ name: "High APR", currentBalance: 10_000, apr: 20, monthlyRepayment: 200 }],
    };
    const bars = computeDebtChartBars(highAprDebt, projection, "GBP");

    const activeInterestBars = bars.filter((b) => b.cumulativeInterest > 0);
    expect(activeInterestBars.length).toBeGreaterThan(0);

    for (let i = 1; i < activeInterestBars.length; i++) {
      expect(activeInterestBars[i].cumulativeInterest).toBeGreaterThanOrEqual(
        activeInterestBars[i - 1].cumulativeInterest,
      );
    }
  });

  it("interestInBalance grows when APR is high relative to repayments", () => {
    const highAprDebt: DebtPortfolioData = {
      totalDebt: 10_000,
      positions: [{ name: "High APR", currentBalance: 10_000, apr: 30, monthlyRepayment: 300 }],
    };
    const projection = makeProjection({ numYears: 5 });
    const bars = computeDebtChartBars(highAprDebt, projection, "GBP");

    // After a year, there should be some interest in the balance
    if (bars.length >= 2) {
      expect(bars[1].interestInBalance).toBeGreaterThan(0);
    }
  });

  it("includes pre-formatted labels on each bar", () => {
    const projection = makeProjection({ numYears: 5 });
    const bars = computeDebtChartBars(sampleDebtData, projection, "GBP");

    for (const bar of bars) {
      expect(bar.label).toBeTruthy();
      expect(typeof bar.label).toBe("string");
      if (bar.principalRemaining > 0) {
        expect(bar.principalLabel).toBeTruthy();
      }
    }
  });

  it("stops projecting 2 years after debt is fully paid", () => {
    const quickDebt: DebtPortfolioData = {
      totalDebt: 1_000,
      positions: [{ name: "Quick", currentBalance: 1_000, apr: 0, monthlyRepayment: 500 }],
    };
    const projection = makeProjection({ numYears: 30 });
    const bars = computeDebtChartBars(quickDebt, projection, "GBP");

    // Should have at most a few bars (current + 1 year payoff + 1-2 zero years)
    expect(bars.length).toBeLessThanOrEqual(4);
  });

  it("handles 0% APR loans correctly (no interest component)", () => {
    const zeroApr: DebtPortfolioData = {
      totalDebt: 12_000,
      positions: [{ name: "BNPL", currentBalance: 12_000, apr: 0, monthlyRepayment: 1_000 }],
    };
    const projection = makeProjection({ numYears: 5 });
    const bars = computeDebtChartBars(zeroApr, projection, "GBP");

    expect(bars.length).toBeGreaterThanOrEqual(2);

    // After 12 months (1 year) at £1000/mo, debt should be paid off
    const yearTwoBars = bars.filter((b) => b.totalDebt === 0);
    expect(yearTwoBars.length).toBeGreaterThanOrEqual(1);

    // Cumulative interest should be 0 for 0% APR
    for (const bar of bars) {
      expect(bar.cumulativeInterest).toBe(0);
      expect(bar.interestInBalance).toBe(0);
    }
  });

  it("handles very high APR where repayment barely covers interest", () => {
    const highApr: DebtPortfolioData = {
      totalDebt: 10_000,
      positions: [{ name: "Shark", currentBalance: 10_000, apr: 40, monthlyRepayment: 350 }],
    };
    const projection = makeProjection({ numYears: 30 });
    const bars = computeDebtChartBars(highApr, projection, "GBP");

    expect(bars.length).toBeGreaterThan(1);
    expect(bars[0].totalDebt).toBe(10_000);
  });

  it("principal decreases while interest may fluctuate", () => {
    const projection = makeProjection({ numYears: 10 });
    const bars = computeDebtChartBars(sampleDebtData, projection, "GBP");

    // Principal should never increase
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i].principalRemaining).toBeLessThanOrEqual(bars[i - 1].principalRemaining + 0.01);
    }
  });
});

// ──────────────────────────────────────────
// buildDebtChartSummary
// ──────────────────────────────────────────

describe("buildDebtChartSummary", () => {
  const sampleDebtData: DebtPortfolioData = {
    totalDebt: 15_000,
    positions: [
      { name: "Credit Card", currentBalance: 5_000, apr: 19.9, monthlyRepayment: 300 },
      { name: "Student Loan", currentBalance: 10_000, apr: 5.5, monthlyRepayment: 200 },
    ],
  };

  it("includes the header", () => {
    const summary = buildDebtChartSummary(sampleDebtData, "GBP");
    expect(summary).toContain("Debt Repayment Projection");
    expect(summary).toContain("-------");
  });

  it("shows total debt", () => {
    const summary = buildDebtChartSummary(sampleDebtData, "GBP");
    expect(summary).toContain("Total Debt:");
    expect(summary).toContain("£15K");
  });

  it("shows number of debts", () => {
    const summary = buildDebtChartSummary(sampleDebtData, "GBP");
    expect(summary).toContain("Number of Debts: 2");
  });

  it("lists each debt position with balance, APR, and monthly repayment", () => {
    const summary = buildDebtChartSummary(sampleDebtData, "GBP");

    expect(summary).toContain("Credit Card");
    expect(summary).toContain("19.9% APR");
    expect(summary).toContain("Student Loan");
    expect(summary).toContain("5.5% APR");
  });

  it("shows monthly interest for positions with APR > 0", () => {
    const summary = buildDebtChartSummary(sampleDebtData, "GBP");
    expect(summary).toContain("Monthly interest:");
  });

  it("does not show monthly interest for 0% APR positions", () => {
    const zeroAprData: DebtPortfolioData = {
      totalDebt: 5_000,
      positions: [{ name: "BNPL", currentBalance: 5_000, apr: 0, monthlyRepayment: 500 }],
    };

    const summary = buildDebtChartSummary(zeroAprData, "GBP");
    expect(summary).not.toContain("Monthly interest:");
  });

  it("shows combined monthly repayments", () => {
    const summary = buildDebtChartSummary(sampleDebtData, "GBP");
    expect(summary).toContain("Combined monthly repayments:");
    expect(summary).toContain("/mo");
  });

  it("uses the correct currency symbol", () => {
    const summaryGBP = buildDebtChartSummary(sampleDebtData, "GBP");
    expect(summaryGBP).toContain("£");

    const summaryUSD = buildDebtChartSummary(sampleDebtData, "USD");
    expect(summaryUSD).toContain("$");
  });

  it("handles single debt position", () => {
    const singleDebt: DebtPortfolioData = {
      totalDebt: 3_000,
      positions: [{ name: "Quick Loan", currentBalance: 3_000, apr: 5, monthlyRepayment: 200 }],
    };

    const summary = buildDebtChartSummary(singleDebt, "GBP");
    expect(summary).toContain("Number of Debts: 1");
    expect(summary).toContain("Quick Loan");
  });
});

// ──────────────────────────────────────────
// buildDashboardMarkdown — debt integration
// ──────────────────────────────────────────

describe("buildDashboardMarkdown with debt data", () => {
  const sampleDebtData: DebtPortfolioData = {
    totalDebt: 15_000,
    positions: [
      { name: "Credit Card", currentBalance: 5_000, apr: 19.9, monthlyRepayment: 300 },
      { name: "Student Loan", currentBalance: 10_000, apr: 5.5, monthlyRepayment: 200 },
    ],
  };

  it("returns debtSvg as null when no debt data is provided", () => {
    const projection = makeProjection({ targetHit: true, fireYear: 2035, fireAge: 45 });
    const result = buildDashboardMarkdown(projection, defaultSettings, "GBP", []);

    expect(result.debtSvg).toBeNull();
    expect(result.debtSummary).toBeNull();
  });

  it("returns debtSvg when debt data is provided", () => {
    const projection = makeProjection({ targetHit: true, fireYear: 2035, fireAge: 45 });
    const result = buildDashboardMarkdown(projection, defaultSettings, "GBP", [], "dark", undefined, sampleDebtData);

    expect(result.debtSvg).toBeTruthy();
    expect(result.debtSvg).toContain("<svg");
  });

  it("returns debtSummary when debt data is provided", () => {
    const projection = makeProjection({ targetHit: true, fireYear: 2035, fireAge: 45 });
    const result = buildDashboardMarkdown(projection, defaultSettings, "GBP", [], "dark", undefined, sampleDebtData);

    expect(result.debtSummary).toBeTruthy();
    expect(result.debtSummary).toContain("Debt Repayment Projection");
  });

  it("embeds the debt SVG as a base64 data URI image in markdown", () => {
    const projection = makeProjection({ targetHit: true, fireYear: 2035, fireAge: 45 });
    const result = buildDashboardMarkdown(projection, defaultSettings, "GBP", [], "dark", undefined, sampleDebtData);

    expect(result.markdown).toContain("![Debt Projection](data:image/svg+xml;base64,");
  });

  it("places the debt chart after the split chart (when both exist)", () => {
    const projection = makeProjection({ targetHit: true, fireYear: 2035, fireAge: 45 });
    const splitData: SplitPortfolioData = {
      accessibleValue: 50_000,
      lockedValue: 50_000,
      accessibleAnnualContribution: 6_000,
      lockedAnnualContribution: 6_000,
    };

    const result = buildDashboardMarkdown(projection, defaultSettings, "GBP", [], "dark", splitData, sampleDebtData);

    const splitPos = result.markdown.indexOf("![Split Projection]");
    const debtPos = result.markdown.indexOf("![Debt Projection]");

    expect(splitPos).toBeGreaterThan(-1);
    expect(debtPos).toBeGreaterThan(-1);
    expect(debtPos).toBeGreaterThan(splitPos);
  });

  it("places the debt chart after the growth chart when no split chart exists", () => {
    const projection = makeProjection({ targetHit: true, fireYear: 2035, fireAge: 45 });

    const result = buildDashboardMarkdown(projection, defaultSettings, "GBP", [], "dark", undefined, sampleDebtData);

    const growthPos = result.markdown.indexOf("![FIRE Projection]");
    const debtPos = result.markdown.indexOf("![Debt Projection]");

    expect(growthPos).toBeGreaterThan(-1);
    expect(debtPos).toBeGreaterThan(-1);
    expect(debtPos).toBeGreaterThan(growthPos);
  });

  it("growth chart includes debt frame overlay on bars when debt data is provided", () => {
    const projection = makeProjection({ targetHit: true, fireYear: 2035, fireAge: 45, currentValue: 100_000 });

    const result = buildDashboardMarkdown(projection, defaultSettings, "GBP", [], "dark", undefined, sampleDebtData);

    expect(result.growthSvg).toBeTruthy();
    expect(result.growthSvg).toContain('class="c-debt"');
    // Frame should have fill="none" (not a solid fill)
    expect(result.growthSvg).toContain('fill="none"');
  });

  it("does not include debt overlay or debt chart when totalDebt is 0", () => {
    const projection = makeProjection({ targetHit: true, fireYear: 2035, fireAge: 45 });
    const zeroDebt: DebtPortfolioData = { totalDebt: 0, positions: [] };

    const result = buildDashboardMarkdown(projection, defaultSettings, "GBP", [], "dark", undefined, zeroDebt);

    expect(result.debtSvg).toBeNull();
    expect(result.markdown).not.toContain("![Debt Projection]");
  });

  it("still returns growthSvg and splitSvg alongside debtSvg", () => {
    const projection = makeProjection({ targetHit: true, fireYear: 2035, fireAge: 45 });
    const splitData: SplitPortfolioData = {
      accessibleValue: 50_000,
      lockedValue: 50_000,
      accessibleAnnualContribution: 6_000,
      lockedAnnualContribution: 6_000,
    };

    const result = buildDashboardMarkdown(projection, defaultSettings, "GBP", [], "dark", splitData, sampleDebtData);

    expect(result.growthSvg).toBeTruthy();
    expect(result.splitSvg).toBeTruthy();
    expect(result.debtSvg).toBeTruthy();
  });

  it("respects light theme for the debt SVG", () => {
    const projection = makeProjection({ targetHit: true, fireYear: 2035, fireAge: 45 });

    const result = buildDashboardMarkdown(projection, defaultSettings, "GBP", [], "light", undefined, sampleDebtData);

    expect(result.debtSvg).toBeTruthy();
    expect(result.debtSvg).toContain('fill="#FFFFFF"');
  });

  it("embeds the debt summary as an SVG <title> tooltip", () => {
    const projection = makeProjection({ targetHit: true, fireYear: 2035, fireAge: 45 });

    const result = buildDashboardMarkdown(projection, defaultSettings, "GBP", [], "dark", undefined, sampleDebtData);

    expect(result.debtSvg).toContain("<title>");
    expect(result.debtSvg).toContain("Debt Repayment Projection");
  });

  it("debt SVG uses principal + interest bars (not old segment bars)", () => {
    const projection = makeProjection({ targetHit: true, fireYear: 2035, fireAge: 45 });

    const result = buildDashboardMarkdown(projection, defaultSettings, "GBP", [], "dark", undefined, sampleDebtData);

    expect(result.debtSvg).toContain('class="d-principal"');
    // Should have interest bars (debt positions have APR > 0)
    expect(result.debtSvg).toContain('class="d-interest"');
    // Should NOT contain old segment classes
    expect(result.debtSvg).not.toContain('class="d-seg0"');
    expect(result.debtSvg).not.toContain('class="d-debt"');
  });
});

// ──────────────────────────────────────────
// Edge Cases
// ──────────────────────────────────────────

describe("debt SVG edge cases", () => {
  it("handles a single debt position with no interest", () => {
    const debtData: DebtPortfolioData = {
      totalDebt: 2_400,
      positions: [{ name: "BNPL", currentBalance: 2_400, apr: 0, monthlyRepayment: 200 }],
    };
    const projection = makeProjection({ numYears: 5 });
    const bars = computeDebtChartBars(debtData, projection, "GBP");

    expect(bars.length).toBeGreaterThan(0);
    const freeYear = bars.find((b) => b.isDebtFreeYear);
    expect(freeYear).toBeTruthy();

    // No interest in any bar for 0% APR
    for (const bar of bars) {
      expect(bar.interestInBalance).toBe(0);
    }
  });

  it("handles multiple debts where one pays off before the other", () => {
    const debtData: DebtPortfolioData = {
      totalDebt: 15_000,
      positions: [
        { name: "Small Debt", currentBalance: 2_000, apr: 0, monthlyRepayment: 500 },
        { name: "Large Debt", currentBalance: 13_000, apr: 5, monthlyRepayment: 300 },
      ],
    };
    const projection = makeProjection({ numYears: 10 });
    const bars = computeDebtChartBars(debtData, projection, "GBP");

    // After 4 months Small Debt is paid off. After 1 year principal should be less than starting
    if (bars.length >= 2) {
      expect(bars[1].principalRemaining).toBeLessThan(bars[0].principalRemaining);
    }
  });

  it("growth SVG handles mixed bars where only some have debt", () => {
    const currentYear = new Date().getFullYear();
    const bars: ChartBar[] = [
      {
        year: currentYear,
        label: "£100K",
        totalValue: 100_000,
        baseGrowthValue: 80_000,
        contributionValue: 20_000,
        isFireYear: false,
        debtValue: 15_000,
        debtLabel: "£15K",
      },
      {
        year: currentYear + 1,
        label: "£120K",
        totalValue: 120_000,
        baseGrowthValue: 96_000,
        contributionValue: 24_000,
        isFireYear: false,
        // No debt on this bar
      },
    ];
    const config: ChartConfig = {
      targetValue: 200_000,
      targetLabel: "£200K",
      theme: "dark",
    };

    const svg = buildProjectionSVG(bars, config);
    expect(svg).toContain('class="c-debt"');

    // Count debt frame rects — should only be on the first bar (1 frame)
    // Plus 1 legend swatch = 2 total
    const debtRects = svg.match(/class="c-debt"/g);
    expect(debtRects?.length).toBe(2);
  });

  it("debt projection SVG with zero interest shows only principal bars", () => {
    const currentYear = new Date().getFullYear();
    const bars: DebtChartBar[] = [
      {
        year: currentYear,
        label: "£5K",
        totalDebt: 5_000,
        principalRemaining: 5_000,
        interestInBalance: 0,
        principalLabel: "£5K",
        interestLabel: "",
        cumulativeInterest: 0,
        isDebtFreeYear: false,
      },
    ];

    const config: DebtChartConfig = {
      startingDebt: 5_000,
      startingDebtLabel: "£5K",
      theme: "dark",
    };

    const svg = buildDebtProjectionSVG(bars, config);
    expect(svg).toBeTruthy();
    expect(svg).toContain('class="d-principal"');
    // No interest bar when interestInBalance is 0
    expect(svg).not.toContain('class="d-interest"');
  });

  it("computeDebtChartBars produces correctly formatted labels with GBP", () => {
    const debtData: DebtPortfolioData = {
      totalDebt: 50_000,
      positions: [{ name: "Mortgage Debt", currentBalance: 50_000, apr: 3.5, monthlyRepayment: 500 }],
    };
    const projection = makeProjection({ numYears: 5 });
    const bars = computeDebtChartBars(debtData, projection, "GBP");

    expect(bars[0].label).toMatch(/^£/);
    expect(bars[0].principalLabel).toMatch(/^£/);
  });

  it("computeDebtChartBars produces correctly formatted labels with USD", () => {
    const debtData: DebtPortfolioData = {
      totalDebt: 50_000,
      positions: [{ name: "Car Loan", currentBalance: 50_000, apr: 6, monthlyRepayment: 800 }],
    };
    const projection = makeProjection({ numYears: 5 });
    const bars = computeDebtChartBars(debtData, projection, "USD");

    expect(bars[0].label).toMatch(/^\$/);
    expect(bars[0].principalLabel).toMatch(/^\$/);
  });

  it("all debt bars have year labels that form an ascending sequence", () => {
    const debtData: DebtPortfolioData = {
      totalDebt: 20_000,
      positions: [{ name: "Loan", currentBalance: 20_000, apr: 5, monthlyRepayment: 400 }],
    };
    const projection = makeProjection({ numYears: 10 });
    const bars = computeDebtChartBars(debtData, projection, "GBP");

    for (let i = 1; i < bars.length; i++) {
      expect(bars[i].year).toBeGreaterThan(bars[i - 1].year);
    }
  });

  it("debt frame uses stroke attribute, not fill", () => {
    const bars = makeSampleGrowthBarsWithDebt();
    const config: ChartConfig = {
      targetValue: 200_000,
      targetLabel: "£200K",
      theme: "dark",
    };

    const svg = buildProjectionSVG(bars, config);

    // The debt frame rects should use stroke, not solid fill
    const debtRects = svg.match(/<rect class="c-debt"[^/]*/g) ?? [];
    for (const rect of debtRects) {
      expect(rect).toContain("stroke=");
      expect(rect).toContain('fill="none"');
    }
  });

  it("all SVGs omit explicit width/height (viewBox only for tighter export)", () => {
    const projection = makeProjection({ targetHit: true, fireYear: 2035, fireAge: 45 });
    const sampleDebtData: DebtPortfolioData = {
      totalDebt: 15_000,
      positions: [{ name: "Card", currentBalance: 15_000, apr: 19.9, monthlyRepayment: 300 }],
    };

    const result = buildDashboardMarkdown(projection, defaultSettings, "GBP", [], "dark", undefined, sampleDebtData);

    // Decode each SVG from base64 and check
    const b64Matches = result.markdown.match(/data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)/g) ?? [];
    expect(b64Matches.length).toBeGreaterThanOrEqual(2); // growth + debt at minimum

    for (const b64Uri of b64Matches) {
      const b64 = b64Uri.replace("data:image/svg+xml;base64,", "");
      const svg = Buffer.from(b64, "base64").toString("utf-8");
      const svgTag = svg.match(/<svg[^>]*>/)?.[0] ?? "";
      expect(svgTag).toContain("viewBox=");
      expect(svgTag).not.toMatch(/\bwidth="/);
      expect(svgTag).not.toMatch(/\bheight="/);
    }
  });

  it("split SVG also omits explicit width/height", () => {
    const projection = makeProjection({ targetHit: true, fireYear: 2035, fireAge: 45 });
    const splitData: SplitPortfolioData = {
      accessibleValue: 50_000,
      lockedValue: 50_000,
      accessibleAnnualContribution: 6_000,
      lockedAnnualContribution: 6_000,
    };

    const result = buildDashboardMarkdown(projection, defaultSettings, "GBP", [], "dark", splitData);

    expect(result.splitSvg).toBeTruthy();
    const svgTag = result.splitSvg!.match(/<svg[^>]*>/)?.[0] ?? "";
    expect(svgTag).toContain("viewBox=");
    expect(svgTag).not.toMatch(/\bwidth="/);
    expect(svgTag).not.toMatch(/\bheight="/);
  });
});
