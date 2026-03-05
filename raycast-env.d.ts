/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Base Currency - Currency used to display total portfolio value. All holdings will be converted to this currency. */
  "baseCurrency": "GBP" | "USD" | "EUR" | "CHF" | "JPY" | "CAD" | "AUD"
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `portfolio` command */
  export type Portfolio = ExtensionPreferences & {}
  /** Preferences accessible in the `search-investments` command */
  export type SearchInvestments = ExtensionPreferences & {}
  /** Preferences accessible in the `fire` command */
  export type Fire = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `portfolio` command */
  export type Portfolio = {}
  /** Arguments passed to the `search-investments` command */
  export type SearchInvestments = {}
  /** Arguments passed to the `fire` command */
  export type Fire = {}
}

