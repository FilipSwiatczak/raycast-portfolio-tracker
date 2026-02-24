/**
 * Tests for the mortgage calculator service.
 *
 * Covers:
 * - Monthly payment calculation (standard amortization formula)
 * - Month-by-month principal/interest breakdown
 * - Cumulative principal repayment between dates
 * - Current equity calculation (original equity + principal + appreciation)
 * - Principal/interest ratio at a given point in time
 *
 * All functions are pure math — no mocks needed.
 */

import {
  calculateMonthlyPayment,
  calculateMonthBreakdown,
  calculateCumulativePrincipal,
  calculateCurrentEquity,
  getCurrentPrincipalInterestRatio,
} from "../services/mortgage-calculator";
import { MortgageData } from "../utils/types";

// ──────────────────────────────────────────
// calculateMonthlyPayment
// ──────────────────────────────────────────

describe("calculateMonthlyPayment", () => {
  it("calculates a standard 25-year mortgage at 4.5%", () => {
    const payment = calculateMonthlyPayment(250000, 4.5, 25);
    // Expected ~£1,389.58 per month
    expect(payment).toBeCloseTo(1389.58, 0);
  });

  it("calculates a 30-year mortgage at 3.5%", () => {
    const payment = calculateMonthlyPayment(300000, 3.5, 30);
    // Expected ~£1,347.13 per month
    expect(payment).toBeCloseTo(1347.13, 0);
  });

  it("calculates a short 10-year mortgage at 5%", () => {
    const payment = calculateMonthlyPayment(200000, 5, 10);
    // Expected ~£2,121.31 per month
    expect(payment).toBeCloseTo(2121.31, 0);
  });

  it("returns 0 for zero principal", () => {
    expect(calculateMonthlyPayment(0, 4.5, 25)).toBe(0);
  });

  it("returns 0 for negative principal", () => {
    expect(calculateMonthlyPayment(-100000, 4.5, 25)).toBe(0);
  });

  it("returns 0 for zero term", () => {
    expect(calculateMonthlyPayment(250000, 4.5, 0)).toBe(0);
  });

  it("returns 0 for negative term", () => {
    expect(calculateMonthlyPayment(250000, 4.5, -5)).toBe(0);
  });

  it("handles 0% interest rate (simple division)", () => {
    const payment = calculateMonthlyPayment(120000, 0, 10);
    // 120000 / (10 * 12) = 1000
    expect(payment).toBe(1000);
  });

  it("handles very high interest rate", () => {
    const payment = calculateMonthlyPayment(100000, 20, 25);
    expect(payment).toBeGreaterThan(0);
    expect(isFinite(payment)).toBe(true);
  });

  it("handles very small principal", () => {
    const payment = calculateMonthlyPayment(100, 4.5, 25);
    expect(payment).toBeGreaterThan(0);
    expect(payment).toBeLessThan(1);
  });

  it("total payments exceed principal due to interest", () => {
    const payment = calculateMonthlyPayment(250000, 4.5, 25);
    const totalPaid = payment * 25 * 12;
    expect(totalPaid).toBeGreaterThan(250000);
  });

  it("total payments equal principal when rate is 0%", () => {
    const payment = calculateMonthlyPayment(120000, 0, 10);
    const totalPaid = payment * 10 * 12;
    expect(totalPaid).toBeCloseTo(120000, 2);
  });
});

// ──────────────────────────────────────────
// calculateMonthBreakdown
// ──────────────────────────────────────────

describe("calculateMonthBreakdown", () => {
  const principal = 250000;
  const rate = 4.5;
  const term = 25;

  it("returns correct values for month 1", () => {
    const m1 = calculateMonthBreakdown(principal, rate, term, 1);
    expect(m1.monthNumber).toBe(1);
    expect(m1.payment).toBeCloseTo(1389.58, 0);
    // Month 1 interest: 250000 * (4.5/100/12) = 937.50
    expect(m1.interest).toBeCloseTo(937.5, 0);
    // Month 1 principal: payment - interest
    expect(m1.principal).toBeCloseTo(1389.58 - 937.5, 0);
    expect(m1.remainingBalance).toBeCloseTo(principal - m1.principal, 0);
  });

  it("month 1 is interest-heavy (interest > principal)", () => {
    const m1 = calculateMonthBreakdown(principal, rate, term, 1);
    expect(m1.interest).toBeGreaterThan(m1.principal);
  });

  it("last month is principal-heavy (principal > interest)", () => {
    const totalMonths = term * 12;
    const mLast = calculateMonthBreakdown(principal, rate, term, totalMonths);
    expect(mLast.principal).toBeGreaterThan(mLast.interest);
  });

  it("last month has near-zero remaining balance", () => {
    const totalMonths = term * 12;
    const mLast = calculateMonthBreakdown(principal, rate, term, totalMonths);
    expect(mLast.remainingBalance).toBeCloseTo(0, 0);
  });

  it("principal + interest equals the monthly payment for any month", () => {
    for (const monthNum of [1, 50, 100, 200, 300]) {
      const breakdown = calculateMonthBreakdown(principal, rate, term, monthNum);
      expect(breakdown.principal + breakdown.interest).toBeCloseTo(breakdown.payment, 2);
    }
  });

  it("principal portion increases over time", () => {
    const m1 = calculateMonthBreakdown(principal, rate, term, 1);
    const m100 = calculateMonthBreakdown(principal, rate, term, 100);
    const m200 = calculateMonthBreakdown(principal, rate, term, 200);
    expect(m100.principal).toBeGreaterThan(m1.principal);
    expect(m200.principal).toBeGreaterThan(m100.principal);
  });

  it("interest portion decreases over time", () => {
    const m1 = calculateMonthBreakdown(principal, rate, term, 1);
    const m100 = calculateMonthBreakdown(principal, rate, term, 100);
    const m200 = calculateMonthBreakdown(principal, rate, term, 200);
    expect(m100.interest).toBeLessThan(m1.interest);
    expect(m200.interest).toBeLessThan(m100.interest);
  });

  it("remaining balance decreases over time", () => {
    const m1 = calculateMonthBreakdown(principal, rate, term, 1);
    const m100 = calculateMonthBreakdown(principal, rate, term, 100);
    const m200 = calculateMonthBreakdown(principal, rate, term, 200);
    expect(m100.remainingBalance).toBeLessThan(m1.remainingBalance);
    expect(m200.remainingBalance).toBeLessThan(m100.remainingBalance);
  });

  it("returns zeros for month 0 (invalid)", () => {
    const m0 = calculateMonthBreakdown(principal, rate, term, 0);
    expect(m0.payment).toBe(0);
    expect(m0.principal).toBe(0);
    expect(m0.interest).toBe(0);
    expect(m0.remainingBalance).toBe(principal);
  });

  it("returns zeros for month beyond term", () => {
    const totalMonths = term * 12;
    const mBeyond = calculateMonthBreakdown(principal, rate, term, totalMonths + 1);
    expect(mBeyond.payment).toBe(0);
    expect(mBeyond.principal).toBe(0);
    expect(mBeyond.interest).toBe(0);
    expect(mBeyond.remainingBalance).toBe(0);
  });

  it("returns zeros for zero principal", () => {
    const m = calculateMonthBreakdown(0, rate, term, 1);
    expect(m.payment).toBe(0);
    expect(m.principal).toBe(0);
    expect(m.interest).toBe(0);
  });

  it("handles 0% interest correctly", () => {
    const m = calculateMonthBreakdown(120000, 0, 10, 1);
    expect(m.payment).toBe(1000);
    expect(m.principal).toBe(1000);
    expect(m.interest).toBe(0);
    expect(m.remainingBalance).toBeCloseTo(119000, 0);
  });

  it("handles 0% interest — remaining balance decreases linearly", () => {
    const m1 = calculateMonthBreakdown(120000, 0, 10, 1);
    const m60 = calculateMonthBreakdown(120000, 0, 10, 60);
    const m120 = calculateMonthBreakdown(120000, 0, 10, 120);
    expect(m1.remainingBalance).toBeCloseTo(119000, 0);
    expect(m60.remainingBalance).toBeCloseTo(60000, 0);
    expect(m120.remainingBalance).toBeCloseTo(0, 0);
  });
});

// ──────────────────────────────────────────
// calculateCumulativePrincipal
// ──────────────────────────────────────────

describe("calculateCumulativePrincipal", () => {
  it("calculates principal repaid over 12 months from the start", () => {
    const principal = 250000;
    const rate = 4.5;
    const term = 25;
    const startDate = "2020-01-01";
    const fromDate = "2020-01-01";
    const toDate = "2020-12-01";

    const cumPrincipal = calculateCumulativePrincipal(principal, rate, term, startDate, fromDate, toDate);

    // Should be roughly 12 months of principal at the start
    // Month 1 principal ≈ 452, increasing slightly each month
    expect(cumPrincipal).toBeGreaterThan(5000);
    expect(cumPrincipal).toBeLessThan(7000);
  });

  it("calculates principal repaid later in the mortgage (higher principal portion)", () => {
    const principal = 250000;
    const rate = 4.5;
    const term = 25;
    const startDate = "2000-01-01";
    const fromDate = "2020-01-01"; // 20 years in
    const toDate = "2020-12-01"; // 12 months later

    const cumPrincipal = calculateCumulativePrincipal(principal, rate, term, startDate, fromDate, toDate);

    // Later in the mortgage, more goes to principal
    const earlyPrincipal = calculateCumulativePrincipal(principal, rate, term, startDate, "2000-01-01", "2000-12-01");
    expect(cumPrincipal).toBeGreaterThan(earlyPrincipal);
  });

  it("returns 0 for zero principal", () => {
    expect(calculateCumulativePrincipal(0, 4.5, 25, "2020-01-01", "2020-01-01", "2020-12-01")).toBe(0);
  });

  it("returns 0 for zero term", () => {
    expect(calculateCumulativePrincipal(250000, 4.5, 0, "2020-01-01", "2020-01-01", "2020-12-01")).toBe(0);
  });

  it("returns 0 for invalid dates", () => {
    expect(calculateCumulativePrincipal(250000, 4.5, 25, "invalid", "2020-01-01", "2020-12-01")).toBe(0);
  });

  it("returns 0 when fromDate is after toDate", () => {
    expect(calculateCumulativePrincipal(250000, 4.5, 25, "2020-01-01", "2022-01-01", "2021-01-01")).toBe(0);
  });

  it("returns a positive value when from and to are in the same month", () => {
    const result = calculateCumulativePrincipal(250000, 4.5, 25, "2020-01-01", "2020-06-01", "2020-06-15");
    // Same month = 1 month of principal
    expect(result).toBeGreaterThan(0);
  });

  it("handles 0% interest (all payment goes to principal)", () => {
    const result = calculateCumulativePrincipal(120000, 0, 10, "2020-01-01", "2020-01-01", "2020-12-01");
    // 12 months * 1000/month = 12000
    expect(result).toBeCloseTo(12000, 0);
  });

  it("total principal repaid over full term equals the original principal", () => {
    const principal = 250000;
    const rate = 4.5;
    const term = 25;
    const startDate = "2000-01-01";
    const endDate = "2024-12-01"; // 25 years = 300 months

    const total = calculateCumulativePrincipal(principal, rate, term, startDate, startDate, endDate);
    expect(total).toBeCloseTo(principal, -2); // within £100
  });

  it("clamps to valid month range when dates extend beyond term", () => {
    const principal = 100000;
    const rate = 5;
    const term = 5; // 60 months

    // From before mortgage start to after mortgage end
    const total = calculateCumulativePrincipal(principal, rate, term, "2020-01-01", "2019-01-01", "2030-01-01");
    expect(total).toBeCloseTo(principal, -2);
  });
});

// ──────────────────────────────────────────
// calculateCurrentEquity
// ──────────────────────────────────────────

describe("calculateCurrentEquity", () => {
  describe("owned outright (equity = total value)", () => {
    const ownedData: MortgageData = {
      totalPropertyValue: 500000,
      equity: 500000,
      valuationDate: "2023-01-01",
      postcode: "SW1A 1AA",
    };

    it("returns full property value as equity when no HPI change", () => {
      const result = calculateCurrentEquity(ownedData, 0);
      expect(result.currentEquity).toBe(500000);
      expect(result.originalEquity).toBe(500000);
      expect(result.outstandingBalance).toBe(0);
      expect(result.principalRepaid).toBe(0);
    });

    it("applies positive HPI appreciation to fully owned property", () => {
      const result = calculateCurrentEquity(ownedData, 5);
      expect(result.currentPropertyValue).toBeCloseTo(525000, 0);
      expect(result.currentEquity).toBeCloseTo(525000, 0);
      expect(result.appreciation).toBeCloseTo(25000, 0);
    });

    it("applies negative HPI depreciation", () => {
      const result = calculateCurrentEquity(ownedData, -3);
      expect(result.currentPropertyValue).toBeCloseTo(485000, 0);
      expect(result.currentEquity).toBeCloseTo(485000, 0);
      expect(result.appreciation).toBeCloseTo(-15000, 0);
    });
  });

  describe("mortgage without repayment data", () => {
    const mortgageData: MortgageData = {
      totalPropertyValue: 350000,
      equity: 100000,
      valuationDate: "2023-06-01",
      postcode: "M1 1AA",
    };

    it("returns original equity when no HPI change and no repayment data", () => {
      const result = calculateCurrentEquity(mortgageData, 0);
      expect(result.currentEquity).toBe(100000);
      expect(result.originalEquity).toBe(100000);
      expect(result.principalRepaid).toBe(0);
      expect(result.outstandingBalance).toBe(250000);
    });

    it("increases equity with positive HPI change", () => {
      const result = calculateCurrentEquity(mortgageData, 4.2);
      // Property value: 350000 * 1.042 = 364700
      // Outstanding: 250000 (unchanged — no repayment data)
      // Equity: 364700 - 250000 = 114700
      expect(result.currentPropertyValue).toBeCloseTo(364700, 0);
      expect(result.currentEquity).toBeCloseTo(114700, 0);
      expect(result.appreciation).toBeCloseTo(14700, 0);
    });

    it("decreases equity with negative HPI change", () => {
      const result = calculateCurrentEquity(mortgageData, -5);
      // Property value: 350000 * 0.95 = 332500
      // Outstanding: 250000
      // Equity: 332500 - 250000 = 82500
      expect(result.currentPropertyValue).toBeCloseTo(332500, 0);
      expect(result.currentEquity).toBeCloseTo(82500, 0);
    });

    it("equity can go below original with large depreciation", () => {
      const result = calculateCurrentEquity(mortgageData, -30);
      // Property value: 350000 * 0.7 = 245000
      // Outstanding: 250000
      // Equity: 245000 - 250000 = -5000 (negative equity)
      expect(result.currentEquity).toBeLessThan(0);
    });

    it("returns correct HPI change percent in result", () => {
      const result = calculateCurrentEquity(mortgageData, 7.3);
      expect(result.hpiChangePercent).toBe(7.3);
    });
  });

  describe("mortgage with repayment data", () => {
    const mortgageDataWithRepayment: MortgageData = {
      totalPropertyValue: 350000,
      equity: 100000,
      valuationDate: "2023-06-01",
      postcode: "M1 1AA",
      mortgageRate: 4.5,
      mortgageTerm: 25,
      mortgageStartDate: "2023-01-01",
    };

    it("includes principal repayment in equity calculation", () => {
      // Calculate as of roughly 2 years later
      const result = calculateCurrentEquity(mortgageDataWithRepayment, 0, "2025-06-01");
      // With 0% HPI, equity should be original + principal repaid
      expect(result.principalRepaid).toBeGreaterThan(0);
      expect(result.currentEquity).toBeGreaterThan(100000);
      expect(result.currentEquity).toBeCloseTo(100000 + result.principalRepaid, 0);
    });

    it("combines principal repayment with HPI appreciation", () => {
      const result = calculateCurrentEquity(mortgageDataWithRepayment, 5, "2025-06-01");
      // Equity = original + principal_repaid + appreciation
      const expectedEquity = result.originalEquity + result.principalRepaid + result.appreciation;
      // Actually currentEquity = currentPropertyValue - outstandingBalance
      // which is equivalent
      expect(result.currentEquity).toBeCloseTo(expectedEquity, 0);
    });

    it("outstanding balance decreases with principal repayment", () => {
      const result = calculateCurrentEquity(mortgageDataWithRepayment, 0, "2025-06-01");
      const originalOutstanding = 350000 - 100000;
      expect(result.outstandingBalance).toBeLessThan(originalOutstanding);
      expect(result.outstandingBalance).toBeCloseTo(originalOutstanding - result.principalRepaid, 0);
    });

    it("outstanding balance is never negative", () => {
      // Even with extreme principal repayment scenarios
      const result = calculateCurrentEquity(mortgageDataWithRepayment, 0, "2060-01-01");
      expect(result.outstandingBalance).toBeGreaterThanOrEqual(0);
    });
  });

  describe("edge cases", () => {
    it("handles zero total property value", () => {
      const data: MortgageData = {
        totalPropertyValue: 0,
        equity: 0,
        valuationDate: "2023-01-01",
        postcode: "SW1A 1AA",
      };
      const result = calculateCurrentEquity(data, 5);
      expect(result.currentEquity).toBe(0);
      expect(result.currentPropertyValue).toBe(0);
    });

    it("handles equity equal to total value (no outstanding mortgage)", () => {
      const data: MortgageData = {
        totalPropertyValue: 300000,
        equity: 300000,
        valuationDate: "2023-01-01",
        postcode: "SW1A 1AA",
        mortgageRate: 4.5,
        mortgageTerm: 25,
        mortgageStartDate: "2020-01-01",
      };
      const result = calculateCurrentEquity(data, 3);
      // No outstanding balance, so no principal to repay
      expect(result.outstandingBalance).toBe(0);
      expect(result.principalRepaid).toBe(0);
      // Equity = property value (fully owned)
      expect(result.currentEquity).toBeCloseTo(309000, 0);
    });

    it("handles 100% HPI increase", () => {
      const data: MortgageData = {
        totalPropertyValue: 200000,
        equity: 50000,
        valuationDate: "2020-01-01",
        postcode: "E1 1AA",
      };
      const result = calculateCurrentEquity(data, 100);
      expect(result.currentPropertyValue).toBeCloseTo(400000, 0);
      // Outstanding stays 150000
      expect(result.currentEquity).toBeCloseTo(250000, 0);
    });
  });
});

// ──────────────────────────────────────────
// getCurrentPrincipalInterestRatio
// ──────────────────────────────────────────

describe("getCurrentPrincipalInterestRatio", () => {
  it("returns null when mortgage repayment data is not provided", () => {
    const data: MortgageData = {
      totalPropertyValue: 350000,
      equity: 100000,
      valuationDate: "2023-01-01",
      postcode: "SW1A 1AA",
    };
    expect(getCurrentPrincipalInterestRatio(data)).toBeNull();
  });

  it("returns null when there is no outstanding mortgage", () => {
    const data: MortgageData = {
      totalPropertyValue: 350000,
      equity: 350000,
      valuationDate: "2023-01-01",
      postcode: "SW1A 1AA",
      mortgageRate: 4.5,
      mortgageTerm: 25,
      mortgageStartDate: "2020-01-01",
    };
    expect(getCurrentPrincipalInterestRatio(data)).toBeNull();
  });

  it("returns a ratio at the start of a mortgage (interest-heavy)", () => {
    const data: MortgageData = {
      totalPropertyValue: 350000,
      equity: 100000,
      valuationDate: "2023-01-01",
      postcode: "SW1A 1AA",
      mortgageRate: 4.5,
      mortgageTerm: 25,
      mortgageStartDate: "2023-01-01",
    };
    const result = getCurrentPrincipalInterestRatio(data, "2023-02-01");
    expect(result).not.toBeNull();
    // Early in mortgage: interest > principal
    expect(result!.interestPercent).toBeGreaterThan(result!.principalPercent);
    // Percentages should sum to ~100
    expect(result!.principalPercent + result!.interestPercent).toBeCloseTo(100, 0);
  });

  it("returns a ratio late in a mortgage (principal-heavy)", () => {
    const data: MortgageData = {
      totalPropertyValue: 350000,
      equity: 100000,
      valuationDate: "2023-01-01",
      postcode: "SW1A 1AA",
      mortgageRate: 4.5,
      mortgageTerm: 25,
      mortgageStartDate: "2000-01-01",
    };
    // 24 years into a 25-year mortgage
    const result = getCurrentPrincipalInterestRatio(data, "2024-01-01");
    expect(result).not.toBeNull();
    // Late in mortgage: principal > interest
    expect(result!.principalPercent).toBeGreaterThan(result!.interestPercent);
  });

  it("principal percentage increases over time", () => {
    const data: MortgageData = {
      totalPropertyValue: 350000,
      equity: 100000,
      valuationDate: "2023-01-01",
      postcode: "SW1A 1AA",
      mortgageRate: 4.5,
      mortgageTerm: 25,
      mortgageStartDate: "2020-01-01",
    };
    const early = getCurrentPrincipalInterestRatio(data, "2020-06-01");
    const middle = getCurrentPrincipalInterestRatio(data, "2030-06-01");
    const late = getCurrentPrincipalInterestRatio(data, "2040-06-01");

    expect(early).not.toBeNull();
    expect(middle).not.toBeNull();
    expect(late).not.toBeNull();

    expect(middle!.principalPercent).toBeGreaterThan(early!.principalPercent);
    expect(late!.principalPercent).toBeGreaterThan(middle!.principalPercent);
  });

  it("includes a positive monthly payment amount", () => {
    const data: MortgageData = {
      totalPropertyValue: 350000,
      equity: 100000,
      valuationDate: "2023-01-01",
      postcode: "SW1A 1AA",
      mortgageRate: 4.5,
      mortgageTerm: 25,
      mortgageStartDate: "2023-01-01",
    };
    const result = getCurrentPrincipalInterestRatio(data, "2023-06-01");
    expect(result).not.toBeNull();
    expect(result!.monthlyPayment).toBeGreaterThan(0);
  });

  it("returns null when current date is before mortgage start", () => {
    const data: MortgageData = {
      totalPropertyValue: 350000,
      equity: 100000,
      valuationDate: "2023-01-01",
      postcode: "SW1A 1AA",
      mortgageRate: 4.5,
      mortgageTerm: 25,
      mortgageStartDate: "2025-01-01",
    };
    // Date before mortgage starts
    const result = getCurrentPrincipalInterestRatio(data, "2024-06-01");
    expect(result).toBeNull();
  });

  it("returns null when current date is after mortgage ends", () => {
    const data: MortgageData = {
      totalPropertyValue: 350000,
      equity: 100000,
      valuationDate: "2023-01-01",
      postcode: "SW1A 1AA",
      mortgageRate: 4.5,
      mortgageTerm: 5,
      mortgageStartDate: "2015-01-01",
    };
    // 5-year term ended in 2020
    const result = getCurrentPrincipalInterestRatio(data, "2025-01-01");
    expect(result).toBeNull();
  });

  it("percentages are always between 0 and 100", () => {
    const data: MortgageData = {
      totalPropertyValue: 350000,
      equity: 100000,
      valuationDate: "2023-01-01",
      postcode: "SW1A 1AA",
      mortgageRate: 4.5,
      mortgageTerm: 25,
      mortgageStartDate: "2023-01-01",
    };
    // Test several points in time
    const dates = ["2023-06-01", "2025-01-01", "2030-01-01", "2035-01-01", "2040-01-01", "2045-01-01", "2047-06-01"];
    for (const date of dates) {
      const result = getCurrentPrincipalInterestRatio(data, date);
      if (result) {
        expect(result.principalPercent).toBeGreaterThanOrEqual(0);
        expect(result.principalPercent).toBeLessThanOrEqual(100);
        expect(result.interestPercent).toBeGreaterThanOrEqual(0);
        expect(result.interestPercent).toBeLessThanOrEqual(100);
      }
    }
  });
});
