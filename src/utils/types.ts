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

/** Asset type as returned by Yahoo Finance (plus CASH for cash holdings) */
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
  UNKNOWN = "UNKNOWN",
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
  /** Daily change in native currency */
  change: number;
  /** Daily change as percentage */
  changePercent: number;
  /** The FX rate applied (1.0 if same as base currency) */
  fxRate: number;
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
