/**
 * Core type definitions for Portfolio Tracker.
 *
 * This file is the single source of truth for all domain types.
 * No runtime logic lives here — only interfaces, enums, and type aliases.
 */

// ──────────────────────────────────────────
// Sorting
// ──────────────────────────────────────────

/** Fields that positions can be sorted by */
export enum SortField {
  VALUE = "VALUE",
  CHANGE = "CHANGE",
}

/** Sort direction */
export enum SortDirection {
  DESC = "DESC",
  ASC = "ASC",
}

/** Combined sort option used by the UI dropdown */
export interface SortOption {
  field: SortField;
  direction: SortDirection;
  /** Display label for the dropdown, e.g. "Value ↓" */
  label: string;
  /** Unique string key for the dropdown value */
  key: string;
}

// ──────────────────────────────────────────
// Enums
// ──────────────────────────────────────────

/** Supported investment account types */
export enum AccountType {
  ISA = "ISA",
  LISA = "LISA",
  SIPP = "SIPP",
  GIA = "GIA",
  _401K = "401K",
  BROKERAGE = "BROKERAGE",
  CRYPTO = "CRYPTO",
  CURRENT_ACCOUNT = "CURRENT ACCOUNT",
  SAVINGS_ACCOUNT = "SAVINGS ACCOUNT",
  PROPERTY = "PROPERTY",
  OTHER = "OTHER",
}

/**
 * Returns true if the account type is locked until a pension access age
 * (e.g. SIPP in the UK, 401K in the US). Locked accounts are not
 * accessible for withdrawal until the holder reaches the specified age.
 *
 * All other account types (ISA, GIA, LISA, Brokerage, etc.) are
 * considered immediately accessible.
 */
export function isLockedAccountType(type: AccountType): boolean {
  return type === AccountType.SIPP || type === AccountType._401K;
}

/**
 * Returns true if the account type is a property account.
 * Property accounts hold MORTGAGE or OWNED_PROPERTY positions
 * and are excluded from FIRE calculations by default (primary
 * residence is not typically counted toward FIRE net worth).
 */
export function isPropertyAccountType(type: AccountType): boolean {
  return type === AccountType.PROPERTY;
}

/** Asset type as returned by Yahoo Finance (plus CASH, MORTGAGE, OWNED_PROPERTY for non-traded holdings) */
export enum AssetType {
  EQUITY = "EQUITY",
  ETF = "ETF",
  MUTUALFUND = "MUTUALFUND",
  INDEX = "INDEX",
  CURRENCY = "CURRENCY",
  CRYPTOCURRENCY = "CRYPTOCURRENCY",
  OPTION = "OPTION",
  FUTURE = "FUTURE",
  /** Cash holding — not a traded instrument. Price is always 1.0 per unit of its currency. */
  CASH = "CASH",
  /** Property with an active mortgage. Value = equity adjusted for HPI appreciation + principal repayment. */
  MORTGAGE = "MORTGAGE",
  /** Property owned outright (no mortgage). Value = total property value adjusted for HPI appreciation. */
  OWNED_PROPERTY = "OWNED_PROPERTY",
  UNKNOWN = "UNKNOWN",
}

/**
 * Returns true if the asset type represents a property holding
 * (mortgage or owned outright). Property positions use HPI data
 * for valuation rather than Yahoo Finance quotes.
 */
export function isPropertyAssetType(type: AssetType): boolean {
  return type === AssetType.MORTGAGE || type === AssetType.OWNED_PROPERTY;
}

/** Classifies errors for display and retry logic */
export enum ErrorType {
  /** Network offline, timeout, 502/503/504 — retryable */
  OFFLINE = "OFFLINE",
  /** 404, bad symbol, parse failure — show in error section */
  API_ERROR = "API_ERROR",
  /** Unexpected / unknown errors */
  UNKNOWN = "UNKNOWN",
}

// ──────────────────────────────────────────
// Property / Mortgage Data
// ──────────────────────────────────────────

/**
 * Additional data stored on MORTGAGE and OWNED_PROPERTY positions.
 *
 * For OWNED_PROPERTY, `equity` always equals `totalPropertyValue` and
 * the mortgage-specific fields (`mortgageRate`, `mortgageTerm`,
 * `mortgageStartDate`) are omitted.
 *
 * For MORTGAGE, if the three optional mortgage detail fields are all
 * provided, the system calculates cumulative principal repayment since
 * valuation and adds it to equity before applying HPI appreciation.
 */
export interface MortgageData {
  /** Full property value at the time of valuation (e.g. £350,000) */
  totalPropertyValue: number;

  /** User's equity stake at the time of valuation (e.g. £100,000) */
  equity: number;

  /** ISO 8601 date string of the last valuation (e.g. "2023-06-15") */
  valuationDate: string;

  /** UK postcode used for HPI region lookup (e.g. "SW1A 1AA") */
  postcode: string;

  /**
   * Annual mortgage interest rate as a percentage (e.g. 4.5 means 4.5%).
   * Optional — when provided with `mortgageTerm` and `mortgageStartDate`,
   * enables principal repayment tracking.
   */
  mortgageRate?: number;

  /**
   * Total mortgage term in years (e.g. 25).
   * Optional — part of the principal tracking triple.
   */
  mortgageTerm?: number;

  /**
   * ISO 8601 date string when the mortgage started (e.g. "2020-01-15").
   * Optional — part of the principal tracking triple.
   */
  mortgageStartDate?: string;

  /**
   * Shared ownership percentage (e.g. 50 means you own 50% of the property).
   * Optional — when set, equity is split according to this percentage after
   * deducting any reserved equity. 100 or undefined = sole ownership.
   */
  sharedOwnershipPercent?: number;

  /**
   * Reserved equity amount that belongs solely to the user, excluded from
   * the shared ownership split (e.g. £30,000 extra deposit contribution).
   * Deducted from equity before the shared ownership modifier is applied,
   * then added back to the user's share afterwards.
   */
  reservedEquity?: number;
}

/**
 * Returns true if the mortgage data has all three optional fields needed
 * to calculate principal repayment (rate, term, and start date).
 */
export function hasMortgageRepaymentData(data: MortgageData): boolean {
  return (
    typeof data.mortgageRate === "number" &&
    typeof data.mortgageTerm === "number" &&
    typeof data.mortgageStartDate === "string" &&
    data.mortgageStartDate.length > 0
  );
}

// ──────────────────────────────────────────
// Core Domain: Portfolio → Account → Position
// ──────────────────────────────────────────

/** A single holding within an account */
export interface Position {
  /** Unique identifier (UUID v4) */
  id: string;
  /** Yahoo Finance symbol, e.g. "VUSA.L", "AAPL" */
  symbol: string;
  /** Human-readable name as returned by Yahoo Finance, e.g. "Vanguard S&P 500 UCITS ETF" */
  name: string;
  /**
   * User-defined display name override.
   * When set, this is used everywhere in the UI instead of `name`.
   * The original `name` is still shown on hover tooltips and in the detail panel.
   * Useful when Yahoo Finance returns cryptic or unhelpful names for certain assets.
   */
  customName?: string;
  /** Number of units held (supports fractional, e.g. 12.5) */
  units: number;
  /** Native currency of the asset, e.g. "GBP", "USD" */
  currency: string;
  /** Asset type for display purposes */
  assetType: AssetType;
  /**
   * Optional manual price override (per unit) in the asset's native currency.
   * When set, this should take precedence over live quotes.
   */
  priceOverride?: number;
  /**
   * Additional data for MORTGAGE and OWNED_PROPERTY positions.
   * Undefined for all other asset types.
   */
  mortgageData?: MortgageData;
  /** ISO 8601 timestamp when this position was added */
  addedAt: string;
}

/** An investment account containing positions */
export interface Account {
  /** Unique identifier (UUID v4) */
  id: string;
  /** User-defined name, e.g. "Vanguard ISA" */
  name: string;
  /** Account classification */
  type: AccountType;
  /** ISO 8601 timestamp when the account was created */
  createdAt: string;
  /** Ordered list of positions within this account */
  positions: Position[];
}

/** Top-level portfolio: all accounts + user preferences */
export interface Portfolio {
  /** All investment accounts */
  accounts: Account[];
  /** ISO 8601 timestamp of last modification */
  updatedAt: string;
}

// ──────────────────────────────────────────
// Price & FX Cache Types
// ──────────────────────────────────────────

/** A cached price entry for a single symbol on a given day */
export interface CachedPrice {
  symbol: string;
  /** Current market price in the asset's native currency */
  price: number;
  /** Native currency code, e.g. "GBP" */
  currency: string;
  /** Human-readable asset name */
  name: string;
  /** Daily price change (absolute) */
  change: number;
  /** Daily price change (percentage, e.g. 1.25 means +1.25%) */
  changePercent: number;
  /** ISO 8601 timestamp when this price was fetched */
  fetchedAt: string;
}

/** A cached FX rate entry for a currency pair on a given day */
export interface CachedFxRate {
  /** Source currency, e.g. "USD" */
  from: string;
  /** Target currency, e.g. "GBP" */
  to: string;
  /** Conversion rate: 1 unit of `from` = `rate` units of `to` */
  rate: number;
  /** ISO 8601 timestamp when this rate was fetched */
  fetchedAt: string;
}

// ──────────────────────────────────────────
// API Response Types (from yahoo-finance service)
// ──────────────────────────────────────────

/** A single result from the asset search API */
export interface AssetSearchResult {
  /** Yahoo Finance symbol */
  symbol: string;
  /** Human-readable name */
  name: string;
  /** Asset classification */
  type: AssetType;
  /** Exchange name, e.g. "LSE", "NMS" */
  exchange: string;
}

/** A price quote from the API */
export interface AssetQuote {
  /** Yahoo Finance symbol */
  symbol: string;
  /** Human-readable name */
  name: string;
  /** Current / last market price */
  price: number;
  /** Currency code */
  currency: string;
  /** Daily absolute change */
  change: number;
  /** Daily percentage change */
  changePercent: number;
  /** Market state, e.g. "REGULAR", "PRE", "POST", "CLOSED" */
  marketState: string;
}

// ──────────────────────────────────────────
// Computed / Display Types (never persisted)
// ──────────────────────────────────────────

/** Valuation of a single position at current prices */
export interface PositionValuation {
  position: Position;
  /** Current price per unit in the position's native currency */
  currentPrice: number;
  /** units × currentPrice in native currency */
  totalNativeValue: number;
  /** Value converted to base currency */
  totalBaseValue: number;
  /** Daily change in native currency (or equity change for property) */
  change: number;
  /** Daily change as percentage (or equity-relative change % for property) */
  changePercent: number;
  /** The FX rate applied (1.0 if same as base currency) */
  fxRate: number;
  /**
   * Raw HPI percentage change since valuation (property positions only).
   * Undefined for non-property positions. Used by the detail panel to
   * display the HPI change separately from the equity-relative changePercent.
   */
  hpiChangePercent?: number;
}

/** Valuation of an account (sum of its positions) */
export interface AccountValuation {
  account: Account;
  positions: PositionValuation[];
  /** Sum of all position values in base currency */
  totalBaseValue: number;
}

/** Valuation of the entire portfolio */
export interface PortfolioValuation {
  accounts: AccountValuation[];
  /** Grand total across all accounts in base currency */
  totalValue: number;
  /** The base currency used for totals */
  baseCurrency: string;
  /** ISO 8601 timestamp of the most recent price fetch */
  lastUpdated: string;
}

// ──────────────────────────────────────────
// Error Handling
// ──────────────────────────────────────────

/** Structured error for display in the UI */
export interface PortfolioError {
  type: ErrorType;
  message: string;
  /** The symbol that triggered the error, if applicable */
  symbol?: string;
  /** ISO 8601 timestamp */
  timestamp: string;
}

// ──────────────────────────────────────────
// Preferences (from Raycast extension preferences)
// ──────────────────────────────────────────

/** Shape of Raycast extension preferences */
export interface ExtensionPreferences {
  baseCurrency: string;
}
