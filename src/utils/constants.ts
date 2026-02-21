/**
 * Constants and lookup tables for Portfolio Tracker.
 *
 * Pure data — no logic, no imports from other project files.
 * Used across components, hooks, and services for consistent display and config.
 */

import { Color } from "@raycast/api";
import { AccountType, AssetType } from "./types";

// ──────────────────────────────────────────
// Account Type Display Labels
// ──────────────────────────────────────────

/** Human-readable labels for each AccountType */
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  [AccountType.ISA]: "ISA",
  [AccountType.LISA]: "LISA",
  [AccountType.SIPP]: "SIPP / Pension",
  [AccountType.GIA]: "General Investment",
  [AccountType.BROKERAGE]: "Brokerage",
  [AccountType._401K]: "401(k)",
  [AccountType.CRYPTO]: "Crypto",
  [AccountType.OTHER]: "Other",
};

/** Ordered list of account types for form dropdowns */
export const ACCOUNT_TYPE_OPTIONS = Object.entries(ACCOUNT_TYPE_LABELS).map(([value, title]) => ({ value, title }));

// ──────────────────────────────────────────
// Asset Type Display Labels & Icons
// ──────────────────────────────────────────

/** Human-readable labels for asset types */
export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  [AssetType.EQUITY]: "Stock",
  [AssetType.ETF]: "ETF",
  [AssetType.MUTUALFUND]: "Mutual Fund",
  [AssetType.INDEX]: "Index",
  [AssetType.CURRENCY]: "Currency",
  [AssetType.CRYPTOCURRENCY]: "Cryptocurrency",
  [AssetType.OPTION]: "Option",
  [AssetType.FUTURE]: "Future",
  [AssetType.UNKNOWN]: "Unknown",
};

// ──────────────────────────────────────────
// Currency Symbols & Configuration
// ──────────────────────────────────────────

/** Maps ISO currency codes to their display symbols */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: "£",
  USD: "$",
  EUR: "€",
  CHF: "Fr",
  JPY: "¥",
  CAD: "C$",
  AUD: "A$",
  SEK: "kr",
  NOK: "kr",
  DKK: "kr",
  HKD: "HK$",
  SGD: "S$",
  CNY: "¥",
  INR: "₹",
  BRL: "R$",
  ZAR: "R",
  GBp: "p", // GBP pence — Yahoo uses "GBp" for LSE-listed prices in pence
};

/**
 * Currencies that Yahoo Finance reports in minor units (e.g. pence instead of pounds).
 * We must divide by the given factor to get the major unit.
 *
 * Example: VUSA.L is quoted in GBp (pence). 7245 GBp = £72.45
 */
export const MINOR_CURRENCY_FACTORS: Record<string, { majorCode: string; divisor: number }> = {
  GBp: { majorCode: "GBP", divisor: 100 },
  ILA: { majorCode: "ILS", divisor: 100 }, // Israeli Agorot
  ZAc: { majorCode: "ZAR", divisor: 100 }, // South African cents
};

// ──────────────────────────────────────────
// Cache Configuration
// ──────────────────────────────────────────

/** Cache key prefixes */
export const CACHE_PREFIX = {
  /** Daily price cache: `price:{symbol}:{YYYY-MM-DD}` */
  PRICE: "price",
  /** Daily FX rate cache: `fx:{from}:{to}:{YYYY-MM-DD}` */
  FX_RATE: "fx",
} as const;

/** Cache capacity in bytes (5 MB — well within Raycast's 10 MB default) */
export const CACHE_CAPACITY_BYTES = 5 * 1024 * 1024;

// ──────────────────────────────────────────
// LocalStorage Keys
// ──────────────────────────────────────────

/** Keys used for Raycast LocalStorage (portfolio persistence) */
export const STORAGE_KEYS = {
  /** The full serialised Portfolio object */
  PORTFOLIO: "portfolio-data",
} as const;

// ──────────────────────────────────────────
// API / Search Configuration
// ──────────────────────────────────────────

/** Debounce delay (ms) for type-ahead search input */
export const SEARCH_DEBOUNCE_MS = 350;

/** Maximum search results to display */
export const SEARCH_MAX_RESULTS = 20;

/** Request timeout for Yahoo Finance calls (ms) */
export const API_TIMEOUT_MS = 10_000;

// ──────────────────────────────────────────
// Display / Formatting Configuration
// ──────────────────────────────────────────

/** Number of decimal places for currency display */
export const CURRENCY_DECIMALS = 2;

/** Number of decimal places for unit display */
export const UNITS_DECIMALS = 4;

/** Number of decimal places for percentage display */
export const PERCENT_DECIMALS = 2;

/** Colour used for positive changes / gains */
export const COLOR_POSITIVE: Color = Color.Green;

/** Colour used for negative changes / losses */
export const COLOR_NEGATIVE: Color = Color.Red;

/** Colour used for neutral / zero changes */
export const COLOR_NEUTRAL: Color = Color.SecondaryText;

// ──────────────────────────────────────────
// Network / Retry Configuration
// ──────────────────────────────────────────

/** HTTP status codes considered "offline" / transient (retryable) */
export const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

/** Network error codes considered "offline" (retryable) */
export const OFFLINE_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EPIPE",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "FETCH_ERROR",
]);
