# Portfolio Tracker — Raycast Extension

Track your investment portfolio and net worth in real time across multiple accounts, directly from Raycast.

![CI](https://github.com/filipawaits/raycast-portfolio-tracker/actions/workflows/ci.yml/badge.svg)
![Stage](https://img.shields.io/badge/stage-1%20%E2%80%93%20core-blue)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)
![License](https://img.shields.io/badge/license-MIT-green)

## Overview

Portfolio Tracker is a Raycast extension that lets you create investment accounts, add positions via a live type-ahead search, and see your total portfolio value at a glance — all without leaving Raycast.

**Stage 1 features:**

- Create and manage investment accounts (ISA, SIPP, Brokerage, GIA, 401(k), Crypto, Other)
- Search for stocks, ETFs, and funds with real-time type-ahead powered by Yahoo Finance
- Add positions with fractional share support
- View total portfolio value with per-account breakdowns
- Rename assets with custom display names (original name shown on hover and in detail view)
- Automatic GBp → GBP (and other minor currency) normalisation for LSE-listed securities
- Daily price caching to minimise API calls
- Cross-currency support with FX rate conversion to your chosen base currency

## Architecture

### Data Model

```
Portfolio
├── Account[]
│   ├── id, name, type (ISA | SIPP | GIA | Brokerage | Debt | ...)
│   └── Position[]
│       ├── id, symbol, name, customName?, units, currency, assetType
│       ├── mortgageData?   (MORTGAGE / OWNED_PROPERTY positions)
│       ├── debtData?       (CREDIT_CARD / LOAN / STUDENT_LOAN / AUTO_LOAN / BNPL positions)
│       └── addedAt
└── updatedAt

DebtData
├── currentBalance, apr, monthlyRepayment, repaymentDayOfMonth
├── enteredAt
├── loanStartDate?, loanEndDate?, totalTermMonths?   (loan progress tracking)
├── paidOff?      (greyed-out strikethrough display when true)
└── archived?     (hidden from default view, excluded from totals)

DebtRepaymentLog (separate LocalStorage key: "debt-repayments")
├── entries[]
│   ├── positionId, appliedCount, cachedBalance
│   ├── cumulativeInterest, cumulativePrincipal
│   └── lastSyncedAt
└── updatedAt
```

> **Custom Names:** When `customName` is set on a position, it is used as the display name everywhere in the UI. The original Yahoo Finance `name` is preserved and shown on hover tooltips and in the detail panel. This is useful when Yahoo returns cryptic or unhelpful names for certain assets.

> **Debt Tracking:** Debt account positions are valued as liabilities — their balances are **subtracted** from the portfolio total to produce a net worth figure. Repayments are auto-tracked: on each portfolio load, the system checks if a repayment day has passed since the last sync and applies the monthly update (interest accrual + repayment deduction) using the formula `newBalance = oldBalance × (1 + APR/12/100) − monthlyRepayment`. For loan types, the monthly repayment can be auto-calculated from start/end dates using a standard amortisation formula.

All data is stored locally using Raycast's `LocalStorage` API. No external database or account required.

### Storage & Caching Strategy

| What            | Where                      | Granularity                           |
| --------------- | -------------------------- | ------------------------------------- |
| Portfolio data  | `LocalStorage` (persisted) | Per-mutation (add/edit/delete)        |
| Asset prices    | `Cache` (in-memory + disk) | Daily — `price:{symbol}:{YYYY-MM-DD}` |
| FX rates        | `Cache` (in-memory + disk) | Daily — `fx:{from}:{to}:{YYYY-MM-DD}` |
| Debt repayments | `LocalStorage` (persisted) | Per-sync — `debt-repayments`          |

The daily cache ensures each symbol is fetched at most **once per day**, regardless of how many times you open the extension. Cache capacity is set to 5 MB (within Raycast's 10 MB default).

### API Layer

The extension uses [yahoo-finance2](https://github.com/gadicc/yahoo-finance2) v3 as its data source:

- **Search** → `yf.search()` — type-ahead for securities by name, ticker, or ISIN
- **Quote** → `yf.quoteSummary()` with `price` module — current price, change, market state
- **FX** → `yf.quoteSummary()` for currency pair symbols (e.g. `USDGBP=X`)

> **Note:** We use `quoteSummary` rather than `quote` because the `quote` endpoint's cookie/crumb consent flow is broken inside Jest's test environment (see [yahoo-finance2 #923](https://github.com/gadicc/yahoo-finance2/issues/923)). `quoteSummary` works in both runtime and test environments.

#### Minor Currency Normalisation

Yahoo Finance returns LSE-listed prices in **pence** (GBp), not pounds (GBP). The service layer automatically converts:

| Yahoo returns | We normalise to | Divisor |
| ------------- | --------------- | ------- |
| `GBp`         | `GBP`           | ÷ 100   |
| `ILA`         | `ILS`           | ÷ 100   |
| `ZAc`         | `ZAR`           | ÷ 100   |

Both price and daily change values are normalised together.

## Project Structure

```
src/
├── portfolio.tsx                 # Main command — portfolio view
├── search-investments.tsx        # Search command — find & add investments
├── fire.tsx                      # FIRE command — Financial Independence dashboard
│
├── components/
│   ├── AccountForm.tsx           # Create/edit account form
│   ├── AssetConfirmation.tsx     # Confirm adding a position (price + units)
│   ├── BatchRenameForm.tsx       # Batch rename matching assets across accounts
│   ├── EditPositionForm.tsx      # Edit asset: units + inline rename with batch detection
│   ├── EmptyPortfolio.tsx        # First-launch empty state
│   ├── FireContributions.tsx     # FIRE: manage recurring monthly contributions (single-frame)
│   ├── FireDashboard.tsx         # FIRE: projection chart + key metrics (Detail view)
│   ├── FireSetup.tsx             # FIRE: settings form (onboarding + edit)
│   ├── PortfolioList.tsx         # Main portfolio list view
│   ├── PositionListItem.tsx      # Individual position row (custom name aware)
│   ├── SearchInvestmentsView.tsx # Type-ahead search UI
│   ├── SearchResultItem.tsx      # Individual search result row
│   └── actions/
│       ├── AccountActions.tsx    # Account-level action panel
│       ├── PortfolioActions.tsx  # Portfolio-level action panel
│       └── PositionActions.tsx   # Position-level action panel (custom name aware)
│
├── hooks/
│   ├── useAssetPrice.ts          # Fetch & cache a single asset price
│   ├── useAssetSearch.ts         # Debounced type-ahead search
│   ├── useFireSettings.ts        # FIRE settings CRUD (own LocalStorage key)
│   ├── usePortfolio.ts           # Portfolio CRUD (LocalStorage)
│   └── usePortfolioValue.ts      # Aggregate valuation across accounts
│
├── services/
│   ├── fire-calculator.ts        # FIRE projection engine (pure, zero side effects)
│   ├── yahoo-finance.ts          # Yahoo Finance API client (single import point)
│   └── price-cache.ts            # Daily price/FX cache layer
│
├── utils/
│   ├── constants.ts              # Config, labels, colour constants
│   ├── errors.ts                 # Error classification & factory
│   ├── fire-charts.ts            # FIRE ASCII chart builder (pure markdown output)
│   ├── fire-types.ts             # FIRE TypeScript interfaces, enums & defaults
│   ├── formatting.ts             # Currency, number, date, display name formatting
│   ├── storage.ts                # LocalStorage read/write helpers
│   ├── types.ts                  # All TypeScript interfaces & enums
│   ├── uuid.ts                   # UUID v4 generation
│   └── validation.ts             # Input validation (units, etc.)
│
└── __tests__/
    ├── __mocks__/
    │   ├── raycast-api.ts        # Mock @raycast/api (Cache, LocalStorage, etc.)
    │   └── raycast-utils.ts      # Mock @raycast/utils (useCachedPromise, etc.)
    ├── fire-calculator.test.ts   # 58 tests — FIRE projection engine
    ├── fire-charts.test.ts       # 51 tests — chart builder & formatting
    ├── formatting.test.ts        # 107 tests — formatting & normalisation
    ├── yahoo-finance.test.ts     # 48 tests — API wrapper logic (mocked)
    └── portfolio-fixtures.ts     # Shared test data (accounts, positions, symbols)
```

### Key Design Principles

1. **Single import point for Yahoo Finance** — only `services/yahoo-finance.ts` imports `yahoo-finance2`. Everything else uses our typed wrapper.
2. **Hooks own state, components own UI** — hooks handle data fetching/mutation, components handle rendering. No API calls in components.
3. **Pure utilities** — `formatting.ts`, `constants.ts`, and `types.ts` have zero side effects and no Raycast imports (except `Color` in constants). `formatting.ts` includes `getDisplayName()` and `hasCustomName()` helpers that resolve the custom name vs original name for consistent display across all components.
4. **Test mocks mirror real API shapes** — mock data in tests uses actual Yahoo Finance response structures captured from live API calls.
5. **Fresh-read mutations** — every mutation in `usePortfolio` reads the latest state from LocalStorage before writing (`await loadPortfolio()`) rather than using the React closure's `portfolio` value. This prevents stale closure bugs when Raycast's `push()` freezes callback props on pushed views. The `optimisticUpdate` callbacks still receive correct in-memory state for responsive UI.
6. **Feature isolation** — the FIRE feature (`fire-calculator.ts`, `fire-charts.ts`, `fire-types.ts`) has zero Raycast imports and zero portfolio mutation logic. It reads portfolio data (via hooks) but stores its own configuration under a separate LocalStorage key (`fire-settings`). All FIRE calculation and chart-building functions are pure and fully testable without mocks.

## Development

### Prerequisites

- Node.js ≥ 22.0.0
- [Raycast](https://raycast.com) installed
- npm

### Setup

```bash
git clone <repo-url>
cd raycast-portfolio-tracker
npm install
```

### Commands

| Command                 | Description                                       |
| ----------------------- | ------------------------------------------------- |
| `npm run dev`           | Start Raycast dev mode (hot reload)               |
| `npm run build`         | Production build                                  |
| `npm test`              | Run all 276 tests                                 |
| `npm run test:watch`    | Run tests in watch mode                           |
| `npm run lint`          | Check ESLint + Prettier (Raycast CLI, local only) |
| `npm run lint:eslint`   | ESLint only (CI-portable, no Raycast CLI)         |
| `npm run lint:prettier` | Prettier format check (CI-portable)               |
| `npm run typecheck`     | TypeScript type check (`tsc --noEmit`)            |
| `npm run fix-lint`      | Auto-fix lint issues                              |

### Running in Raycast

```bash
npm run dev
```

This opens the extension in Raycast with hot reload. Changes to any file will be reflected immediately.

### Extension Preferences

| Preference    | Type     | Default | Description                                                                                                        |
| ------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| Base Currency | Dropdown | `GBP`   | Currency for total portfolio value. All holdings are converted to this. Options: GBP, USD, EUR, CHF, JPY, CAD, AUD |

## Testing

### Test Architecture

Tests are split into four files:

- **`formatting.test.ts`** (107 tests) — pure unit tests for all formatting, normalisation, and date utilities. No mocks needed.
- **`yahoo-finance.test.ts`** (48 tests) — tests for the API wrapper layer with `yahoo-finance2` mocked at the module level.
- **`fire-calculator.test.ts`** (58 tests) — pure unit tests for the FIRE projection engine: compound growth, FIRE number calculation, real rate conversion, day/working-day counting, full projection timelines, and edge cases.
- **`fire-charts.test.ts`** (51 tests) — pure unit tests for the chart builder: bar construction, compact value formatting, projection chart output, and dashboard markdown assembly.

### Why Mock Yahoo Finance?

The `yahoo-finance2` library has a [known issue (#923)](https://github.com/gadicc/yahoo-finance2/issues/923) where its cookie/crumb consent flow fails specifically inside Jest's test environment. The API works perfectly in actual Node.js runtime (verified via direct execution). The mock approach lets us:

- Test our wrapper logic (normalisation, mapping, error handling, batching) deterministically
- Run tests in < 0.3 seconds with zero network dependency
- Use realistic fixture data captured from the live API

### Test Coverage

| Area                          | Tests  | What's Verified                                                |
| ----------------------------- | ------ | -------------------------------------------------------------- |
| Currency formatting           | 24     | Symbol lookup, sign handling, decimal control                  |
| Compact formatting            | 12     | K/M/B suffixes, edge cases                                     |
| Number formatting             | 9      | Decimals, separators, NaN/Infinity                             |
| Unit formatting               | 10     | Trailing zeros, fractional precision                           |
| Percent formatting            | 9      | Sign, decimals, large values                                   |
| Date formatting               | 4      | ISO parsing, timezone handling                                 |
| Relative time                 | 7      | Minutes, hours, days, edge boundaries                          |
| Date keys                     | 4      | YYYY-MM-DD format, current date                                |
| Currency normalisation        | 18     | GBp→GBP, ILA→ILS, ZAc→ZAR, pass-through                        |
| Display name helpers          | 12     | getDisplayName, hasCustomName, edge cases                      |
| Edge cases                    | 12     | Large numbers, very small values, NaN                          |
| Search wrapper                | 9      | Filtering, name extraction, type mapping                       |
| Quote wrapper                 | 10     | Field mapping, GBp normalisation, USD pass-through             |
| Batch quotes                  | 5      | Parallel fetch, partial failure, empty input                   |
| FX rates                      | 8      | Same-currency, real pairs, reciprocal check                    |
| Asset type mapping            | 4      | EQUITY, ETF, INDEX classification                              |
| End-to-end flow               | 3      | Search → Quote → FX → Position value calculation               |
| Normalisation edge cases      | 4      | Price+change normalisation, percent pass-through, negatives    |
| **FIRE: Real growth rate**    | **5**  | **Nominal → real conversion, zero, negative, high rates**      |
| **FIRE: FIRE number**         | **7**  | **Spending + withdrawal rate → target, edge cases**            |
| **FIRE: Year projection**     | **6**  | **Compound growth, contributions, zero/negative rates**        |
| **FIRE: Contributions**       | **4**  | **Aggregation, filtering, empty/single**                       |
| **FIRE: Days & working days** | **9**  | **Calendar days, fractional years, business days, holidays**   |
| **FIRE: Full projection**     | **20** | **Timeline, FIRE year, SIPP, metrics, edge cases, accuracy**   |
| **FIRE: Bar construction**    | **10** | **Fill, empty, target marker, boundaries, width preservation** |
| **FIRE: Compact formatting**  | **20** | **K/M/B suffixes, currencies, negatives, boundaries**          |
| **FIRE: Projection chart**    | **10** | **Code block, year lines, FIRE marker, legend, zero values**   |
| **FIRE: Dashboard markdown**  | **11** | **Header, status, assumptions, contributions table, currency** |

### Running Tests

```bash
# All tests
npm test

# Just formatting
npx jest --testPathPattern=formatting

# Just API wrapper
npx jest --testPathPattern=yahoo-finance

# Just FIRE calculator
npx jest --testPathPattern=fire-calculator

# Just FIRE charts
npx jest --testPathPattern=fire-charts

# Watch mode
npm run test:watch
```

## Sample Portfolio (Test Fixtures)

The test fixtures in `portfolio-fixtures.ts` define a realistic two-account portfolio:

**Vanguard ISA** (UK tax-advantaged):
| Symbol | Name | Units | Currency | Type |
|--------|------|-------|----------|------|
| VUSA.L | Vanguard S&P 500 UCITS ETF | 50 | GBP* | ETF |
| VWRL.L | Vanguard FTSE All-World UCITS ETF | 100 | GBP* | ETF |
| AZN.L | AstraZeneca PLC | 25 | GBP* | Equity |
| SHEL.L | Shell PLC | 40 | GBP* | Equity |

**Trading212** (Brokerage):
| Symbol | Name | Units | Currency | Type |
|--------|------|-------|----------|------|
| AAPL | Apple Inc. | 30 | USD | Equity |
| MSFT | Microsoft Corporation | 15 | USD | Equity |
| GOOGL | Alphabet Inc. | 10.5 | USD | Equity |
| VOO | Vanguard S&P 500 ETF | 5 | USD | ETF |

\* Yahoo Finance returns LSE prices in GBp (pence); our service normalises to GBP (pounds).

## Registered Commands

| Command              | Title              | Description                                                                     |
| -------------------- | ------------------ | ------------------------------------------------------------------------------- |
| `portfolio`          | Portfolio Tracker  | View your investment portfolio and track net worth                              |
| `search-investments` | Search Investments | Search for stocks, ETFs, and funds to add to your portfolio                     |
| `fire`               | FIRE Dashboard     | Financial Independence, Retire Early — track your progress to financial freedom |
