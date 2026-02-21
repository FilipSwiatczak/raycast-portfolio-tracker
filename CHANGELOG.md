# Portfolio Tracker Changelog

## [Stage 1] - 2026-02-21

### Architecture & Setup

- Designed full data model: Portfolio → Account → Position hierarchy
- Configured Raycast extension with two commands: `portfolio` and `search-investments`
- Set up TypeScript, Jest (ts-jest), ESLint (@raycast/eslint-config), and Prettier
- Added `yahoo-finance2` v3.13.0 as the financial data provider
- Created comprehensive Jest mocks for `@raycast/api` and `@raycast/utils`

### Core Services

- **Yahoo Finance client** (`services/yahoo-finance.ts`) — single import point for all API calls
  - `searchAssets()` — type-ahead search with quoteType mapping to our AssetType enum
  - `getQuote()` — price quotes via `quoteSummary` (bypasses broken `quote` consent flow)
  - `getQuotes()` — parallel batch fetching with partial failure tolerance
  - `getFxRate()` — currency pair conversion with same-currency short-circuit
- **Price cache** (`services/price-cache.ts`) — daily per-symbol cache using Raycast Cache API
  - Cache key format: `price:{symbol}:{YYYY-MM-DD}` and `fx:{from}:{to}:{YYYY-MM-DD}`
  - 5 MB capacity, automatic daily invalidation

### Data Layer

- **Portfolio storage** (`utils/storage.ts`) — full CRUD via Raycast LocalStorage
- **Portfolio hook** (`hooks/usePortfolio.ts`) — React hook for portfolio state management
  - Add/edit/delete accounts and positions with optimistic updates
- **Valuation hook** (`hooks/usePortfolioValue.ts`) — aggregates prices across accounts
- **Price hook** (`hooks/useAssetPrice.ts`) — cached single-asset price fetching
- **Search hook** (`hooks/useAssetSearch.ts`) — debounced type-ahead search

### UI Components

- `PortfolioList` — main view with account sections and position rows
- `PositionListItem` — individual position with price, change, and value display
- `SearchInvestmentsView` / `SearchResultItem` — type-ahead search interface
- `AssetConfirmation` / `AssetConfirmationForm` — confirm position addition with live price
- `EditPositionForm` — edit unit count for existing positions
- `EmptyPortfolio` — first-launch onboarding state
- Action panels: `PortfolioActions`, `AccountActions`, `PositionActions`

### Utilities

- **Formatting** (`utils/formatting.ts`) — currency, number, percent, date, relative time, compact notation
- **Minor currency normalisation** — automatic GBp→GBP, ILA→ILS, ZAc→ZAR conversion
- **Constants** (`utils/constants.ts`) — labels, symbols, colours, cache config
- **Validation** (`utils/validation.ts`) — units input validation
- **Error handling** (`utils/errors.ts`) — error classification and factory
- **UUID** (`utils/uuid.ts`) — deterministic ID generation

### Testing

- **155 tests across 2 suites**, all passing in < 0.3s
- `formatting.test.ts` — 107 pure unit tests for all formatting and normalisation functions
- `yahoo-finance.test.ts` — 48 tests for API wrapper logic with mocked `yahoo-finance2`
  - Search, quote, batch quote, FX rate, error handling, type mapping, end-to-end flows
  - Mock data captured from live Yahoo Finance API responses
- `portfolio-fixtures.ts` — shared test data covering US/UK markets, ETFs, equities, FX pairs

### Bug Fixes

- Switched from `yf.quote()` to `yf.quoteSummary()` to bypass Yahoo Finance's broken cookie/crumb consent flow (yahoo-finance2 issue #923 — Jest-specific failure)
- Fixed all ESLint unused-variable warnings across components, services, and mocks
- Applied Prettier formatting to all source files

## [Initial Version] - {PR_MERGE_DATE}