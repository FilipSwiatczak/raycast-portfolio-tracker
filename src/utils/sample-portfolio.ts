/**
 * Sample portfolio data for the empty-state preview feature.
 *
 * When a new user opens Portfolio Tracker for the first time, they can choose
 * "See Sample Portfolio" to load a realistic demo portfolio. This gives them
 * a feel for how the extension works before adding their own data.
 *
 * All sample account and position IDs are prefixed with SAMPLE_ID_PREFIX
 * so they can be identified and removed without a deletion confirmation.
 *
 * The sample data mirrors the test fixtures but uses the sample prefix
 * convention for easy cleanup.
 */

import { Account, AccountType, AssetType, Position } from "./types";
import { SAMPLE_ID_PREFIX } from "./constants";

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────

/** Checks whether an account ID belongs to the sample portfolio */
export function isSampleAccount(accountId: string): boolean {
  return accountId.startsWith(SAMPLE_ID_PREFIX);
}

/** Checks whether a portfolio contains any sample accounts */
export function hasSampleAccounts(accounts: Account[]): boolean {
  return accounts.some((a) => isSampleAccount(a.id));
}

// ──────────────────────────────────────────
// Sample Positions
// ──────────────────────────────────────────

const SAMPLE_POSITIONS_ISA: Position[] = [
  {
    id: `${SAMPLE_ID_PREFIX}pos-vusa`,
    symbol: "VUSA.L",
    name: "Vanguard S&P 500 UCITS ETF",
    units: 50,
    currency: "GBP",
    assetType: AssetType.ETF,
    addedAt: "2024-03-15T10:00:00.000Z",
  },
  {
    id: `${SAMPLE_ID_PREFIX}pos-vwrl`,
    symbol: "VWRL.L",
    name: "Vanguard FTSE All-World UCITS ETF",
    units: 100,
    currency: "GBP",
    assetType: AssetType.ETF,
    addedAt: "2024-01-10T09:30:00.000Z",
  },
  {
    id: `${SAMPLE_ID_PREFIX}pos-azn`,
    symbol: "AZN.L",
    name: "AstraZeneca PLC",
    units: 25,
    currency: "GBP",
    assetType: AssetType.EQUITY,
    addedAt: "2024-06-01T14:00:00.000Z",
  },
  {
    id: `${SAMPLE_ID_PREFIX}pos-shel`,
    symbol: "SHEL.L",
    name: "Shell PLC",
    units: 40,
    currency: "GBP",
    assetType: AssetType.EQUITY,
    addedAt: "2024-05-20T11:00:00.000Z",
  },
];

const SAMPLE_POSITIONS_BROKERAGE: Position[] = [
  {
    id: `${SAMPLE_ID_PREFIX}pos-aapl`,
    symbol: "AAPL",
    name: "Apple Inc.",
    units: 30,
    currency: "USD",
    assetType: AssetType.EQUITY,
    addedAt: "2024-02-14T15:00:00.000Z",
  },
  {
    id: `${SAMPLE_ID_PREFIX}pos-msft`,
    symbol: "MSFT",
    name: "Microsoft Corporation",
    units: 15,
    currency: "USD",
    assetType: AssetType.EQUITY,
    addedAt: "2024-04-01T12:00:00.000Z",
  },
  {
    id: `${SAMPLE_ID_PREFIX}pos-googl`,
    symbol: "GOOGL",
    name: "Alphabet Inc.",
    units: 10.5,
    currency: "USD",
    assetType: AssetType.EQUITY,
    addedAt: "2024-07-01T16:30:00.000Z",
  },
  {
    id: `${SAMPLE_ID_PREFIX}pos-voo`,
    symbol: "VOO",
    name: "Vanguard S&P 500 ETF",
    units: 5,
    currency: "USD",
    assetType: AssetType.ETF,
    addedAt: "2024-03-01T10:00:00.000Z",
  },
];

// ──────────────────────────────────────────
// Sample Accounts
// ──────────────────────────────────────────

/**
 * Pre-built sample accounts ready to be merged into a portfolio.
 *
 * Contains:
 * - A UK ISA with 4 LSE-listed positions (2 ETFs + 2 equities)
 * - A US Brokerage with 4 US-listed positions (3 equities + 1 ETF)
 *
 * This gives the user a realistic two-account, cross-currency preview
 * that exercises all display features (FX conversion, GBp normalisation,
 * fractional shares, multiple asset types).
 */
export const SAMPLE_ACCOUNTS: Account[] = [
  {
    id: `${SAMPLE_ID_PREFIX}acc-isa`,
    name: "Sample ISA",
    type: AccountType.ISA,
    createdAt: new Date().toISOString(),
    positions: SAMPLE_POSITIONS_ISA,
  },
  {
    id: `${SAMPLE_ID_PREFIX}acc-brokerage`,
    name: "Sample Brokerage",
    type: AccountType.BROKERAGE,
    createdAt: new Date().toISOString(),
    positions: SAMPLE_POSITIONS_BROKERAGE,
  },
];
