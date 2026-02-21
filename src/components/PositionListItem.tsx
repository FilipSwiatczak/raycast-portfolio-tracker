/**
 * PositionListItem component.
 *
 * Renders a single position (holding) as a List.Item within the portfolio view.
 * This is the most frequently rendered component in the extension — every position
 * in every account renders as one of these.
 *
 * Supports two display modes controlled by the parent's `isShowingDetail` toggle:
 *
 * **Default mode (no detail panel):**
 * Full-width list with rich accessories showing key financial data at a glance.
 * ```
 * [icon] Vanguard S&P 500 UCITS ETF          £72.45   +1.25%   £3,622.50
 *        VUSA.L · 50 units
 * ```
 *
 * **Detail mode (with detail panel):**
 * Split-pane layout. Left side shows name + financial summary in subtitle.
 * Right side shows the full metadata detail panel.
 * ```
 * [icon] Vanguard S&P 500 UCITS ETF     |  [Detail Panel]
 *        VUSA.L · £72.45 · +1.25%       |
 * ```
 *
 * Keywords include the account name, symbol, asset type, and currency
 * so that filtering in the search bar matches accounts and asset attributes.
 *
 * Usage:
 * ```tsx
 * <PositionListItem
 *   valuation={positionValuation}
 *   baseCurrency="GBP"
 *   accountName="Vanguard ISA"
 *   isShowingDetail={false}
 *   actions={<ActionPanel>...</ActionPanel>}
 * />
 * ```
 */

import React from "react";
import { Color, Icon, List } from "@raycast/api";
import { PositionValuation, AssetType } from "../utils/types";
import { formatCurrency, formatCurrencyCompact, formatPercent, formatUnits, formatDate } from "../utils/formatting";
import { ASSET_TYPE_LABELS, COLOR_POSITIVE, COLOR_NEGATIVE, COLOR_NEUTRAL } from "../utils/constants";

// ──────────────────────────────────────────
// Props
// ──────────────────────────────────────────

interface PositionListItemProps {
  /** The computed valuation data for this position */
  valuation: PositionValuation;

  /** The user's base currency for displaying converted values */
  baseCurrency: string;

  /** The name of the parent account (used for keywords / filtering) */
  accountName: string;

  /** Whether the parent List is showing the detail panel */
  isShowingDetail: boolean;

  /**
   * ActionPanel element to render when this item is selected.
   * Composed by the parent to include position, account, and portfolio actions.
   */
  actions: React.JSX.Element;
}

// ──────────────────────────────────────────
// Asset Type → Icon Mapping
// ──────────────────────────────────────────

const ASSET_TYPE_ICONS: Record<AssetType, Icon> = {
  [AssetType.EQUITY]: Icon.Building,
  [AssetType.ETF]: Icon.BarChart,
  [AssetType.MUTUALFUND]: Icon.BankNote,
  [AssetType.INDEX]: Icon.LineChart,
  [AssetType.CURRENCY]: Icon.Coins,
  [AssetType.CRYPTOCURRENCY]: Icon.Crypto,
  [AssetType.OPTION]: Icon.Switch,
  [AssetType.FUTURE]: Icon.Calendar,
  [AssetType.UNKNOWN]: Icon.QuestionMarkCircle,
};

// ──────────────────────────────────────────
// Component
// ──────────────────────────────────────────

export function PositionListItem({
  valuation,
  baseCurrency,
  accountName,
  isShowingDetail,
  actions,
}: PositionListItemProps): React.JSX.Element {
  const { position, currentPrice, totalNativeValue, totalBaseValue, change, changePercent, fxRate } = valuation;

  // ── Computed Display Values ──

  const icon = ASSET_TYPE_ICONS[position.assetType] ?? Icon.QuestionMarkCircle;
  const typeLabel = ASSET_TYPE_LABELS[position.assetType] ?? "Unknown";

  const isCrossCurrency = position.currency !== baseCurrency;
  const hasPrice = currentPrice > 0;

  // Change colour
  const changeColor = changePercent > 0 ? COLOR_POSITIVE : changePercent < 0 ? COLOR_NEGATIVE : COLOR_NEUTRAL;

  // ── Keywords (for search bar filtering) ──
  // Include account name so filtering by account name shows its positions.
  // Include symbol, type, and currency for broad searchability.

  const keywords = [position.symbol, accountName, typeLabel, position.currency, position.name];

  // ── Mode-Specific Rendering ──

  if (isShowingDetail) {
    return renderDetailMode({
      position,
      icon,
      typeLabel,
      hasPrice,
      currentPrice,
      totalNativeValue,
      totalBaseValue,
      change,
      changePercent,
      changeColor,
      fxRate,
      isCrossCurrency,
      baseCurrency,
      keywords,
      actions,
    });
  }

  return renderListMode({
    position,
    icon,
    hasPrice,
    currentPrice,
    totalBaseValue,
    changePercent,
    changeColor,
    baseCurrency,
    keywords,
    actions,
  });
}

// ──────────────────────────────────────────
// Default Mode — Full-Width List (no detail panel)
// ──────────────────────────────────────────

interface ListModeProps {
  position: PositionValuation["position"];
  icon: Icon;
  hasPrice: boolean;
  currentPrice: number;
  totalBaseValue: number;
  changePercent: number;
  changeColor: Color;
  baseCurrency: string;
  keywords: string[];
  actions: React.JSX.Element;
}

/**
 * Renders the position as a full-width list item with accessories.
 *
 * Layout:
 * ```
 * [icon] Name                           £72.45   +1.25%   £3,622.50
 *        VUSA.L · 50 units
 * ```
 *
 * Accessories (left → right, rightmost = highest priority / preserved longest):
 * 1. Price in native currency
 * 2. Daily change percentage (coloured tag)
 * 3. Total value in base currency (most important, rightmost)
 */
function renderListMode({
  position,
  icon,
  hasPrice,
  currentPrice,
  totalBaseValue,
  changePercent,
  changeColor,
  baseCurrency,
  keywords,
  actions,
}: ListModeProps): React.JSX.Element {
  const subtitle = `${position.symbol} · ${formatUnits(position.units)} units`;

  const accessories: List.Item.Accessory[] = [];

  if (hasPrice) {
    // Price in native currency
    accessories.push({
      text: { value: formatCurrency(currentPrice, position.currency), color: Color.SecondaryText },
      tooltip: `Price per unit in ${position.currency}`,
    });

    // Daily change percentage (coloured tag)
    accessories.push({
      tag: {
        value: formatPercent(changePercent),
        color: changeColor,
      },
      tooltip: `Day change: ${formatPercent(changePercent)}`,
    });

    // Total value in base currency (rightmost = most prominent)
    accessories.push({
      text: { value: formatCurrencyCompact(totalBaseValue, baseCurrency), color: Color.PrimaryText },
      tooltip: `Total value: ${formatCurrency(totalBaseValue, baseCurrency)}`,
    });
  } else {
    accessories.push({
      text: { value: "No price", color: Color.SecondaryText },
      tooltip: "Price data not yet available",
    });
  }

  return (
    <List.Item
      id={position.id}
      icon={icon}
      title={position.name}
      subtitle={subtitle}
      accessories={accessories}
      keywords={keywords}
      actions={actions}
    />
  );
}

// ──────────────────────────────────────────
// Detail Mode — Split-Pane (with detail panel)
// ──────────────────────────────────────────

interface DetailModeProps {
  position: PositionValuation["position"];
  icon: Icon;
  typeLabel: string;
  hasPrice: boolean;
  currentPrice: number;
  totalNativeValue: number;
  totalBaseValue: number;
  change: number;
  changePercent: number;
  changeColor: Color;
  fxRate: number;
  isCrossCurrency: boolean;
  baseCurrency: string;
  keywords: string[];
  actions: React.JSX.Element;
}

/**
 * Renders the position with a detail panel on the right.
 *
 * List row (left side):
 * ```
 * [icon] Name
 *        VUSA.L · £72.45 · +1.25% · £3,622 total
 * ```
 *
 * Detail panel (right side):
 * Full metadata with groupings: Asset Info, Price & Change, Holdings, Metadata
 */
function renderDetailMode({
  position,
  icon,
  typeLabel,
  hasPrice,
  currentPrice,
  totalNativeValue,
  totalBaseValue,
  change,
  changePercent,
  changeColor,
  fxRate,
  isCrossCurrency,
  baseCurrency,
  keywords,
  actions,
}: DetailModeProps): React.JSX.Element {
  // When detail is showing, accessories are hidden by Raycast.
  // Pack key financial info into the subtitle instead.
  const subtitleParts = [position.symbol];

  if (hasPrice) {
    subtitleParts.push(formatCurrency(currentPrice, position.currency));
    subtitleParts.push(formatPercent(changePercent));
    subtitleParts.push(`${formatCurrencyCompact(totalBaseValue, baseCurrency)} total`);
  }

  const subtitle = subtitleParts.join(" · ");

  // ── Detail Panel ──

  const detail = (
    <List.Item.Detail
      metadata={
        <List.Item.Detail.Metadata>
          {/* ── Asset Info ── */}
          <List.Item.Detail.Metadata.Label title="Asset" text={position.name} />
          <List.Item.Detail.Metadata.Label title="Symbol" text={position.symbol} />
          <List.Item.Detail.Metadata.TagList title="Type">
            <List.Item.Detail.Metadata.TagList.Item text={typeLabel} />
          </List.Item.Detail.Metadata.TagList>

          <List.Item.Detail.Metadata.Separator />

          {/* ── Price & Change ── */}
          {hasPrice ? (
            <>
              <List.Item.Detail.Metadata.Label
                title="Current Price"
                text={formatCurrency(currentPrice, position.currency)}
              />
              <List.Item.Detail.Metadata.Label
                title="Day Change"
                text={{
                  value: `${formatCurrency(change, position.currency, { showSign: true })} (${formatPercent(changePercent)})`,
                  color: changeColor,
                }}
              />
            </>
          ) : (
            <List.Item.Detail.Metadata.Label
              title="Price"
              text={{ value: "Unavailable", color: Color.SecondaryText }}
            />
          )}

          <List.Item.Detail.Metadata.Separator />

          {/* ── Holdings ── */}
          <List.Item.Detail.Metadata.Label title="Units Held" text={formatUnits(position.units)} />

          {hasPrice && (
            <>
              <List.Item.Detail.Metadata.Label
                title={`Value (${position.currency})`}
                text={formatCurrency(totalNativeValue, position.currency)}
              />

              {isCrossCurrency && (
                <>
                  <List.Item.Detail.Metadata.Label
                    title={`Value (${baseCurrency})`}
                    text={formatCurrency(totalBaseValue, baseCurrency)}
                  />
                  <List.Item.Detail.Metadata.Label
                    title="FX Rate"
                    text={`1 ${position.currency} = ${fxRate.toFixed(4)} ${baseCurrency}`}
                  />
                </>
              )}
            </>
          )}

          <List.Item.Detail.Metadata.Separator />

          {/* ── Metadata ── */}
          <List.Item.Detail.Metadata.Label title="Currency" text={position.currency} />
          <List.Item.Detail.Metadata.Label title="Added" text={formatDate(position.addedAt)} />
        </List.Item.Detail.Metadata>
      }
    />
  );

  return (
    <List.Item
      id={position.id}
      icon={icon}
      title={position.name}
      subtitle={subtitle}
      keywords={keywords}
      detail={detail}
      actions={actions}
    />
  );
}
