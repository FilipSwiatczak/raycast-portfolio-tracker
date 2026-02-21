/**
 * PositionListItem component.
 *
 * Renders a single position (holding) as a List.Item within the portfolio view.
 * This is the most frequently rendered component in the extension — every position
 * in every account renders as one of these.
 *
 * Each item displays:
 * - Asset icon (based on type: stock, ETF, fund, etc.)
 * - Asset name as the main title
 * - Symbol + units as subtitle
 * - Total value in base currency as the primary accessory
 * - Daily change percentage as a coloured tag accessory
 * - Detail panel (List.Item.Detail) with full position metadata on the right side
 *
 * The detail panel includes:
 * - Current price in native currency
 * - Daily change (absolute + percentage)
 * - Number of units held
 * - Total value in native currency
 * - Total value in base currency (if different)
 * - FX rate applied (if cross-currency)
 * - Date the position was added
 *
 * Actions are provided via the `actions` prop to allow the parent to compose
 * PortfolioActions + AccountActions + PositionActions together.
 *
 * Usage:
 * ```tsx
 * <PositionListItem
 *   valuation={positionValuation}
 *   baseCurrency="GBP"
 *   actions={
 *     <ActionPanel>
 *       <PositionActions ... />
 *       <AccountActions ... />
 *       <PortfolioActions ... />
 *     </ActionPanel>
 *   }
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

/**
 * Renders a single position as a List.Item with a detail panel.
 *
 * Layout (list row):
 * ```
 * [icon] Vanguard S&P 500 UCITS ETF                    £3,622.50  |  +1.25%
 *        VUSA.L · 50 units
 * ```
 *
 * Detail panel (right side when `isShowingDetail` is true on the parent List):
 * - Price, change, units, values, FX rate, and date metadata
 */
export function PositionListItem({ valuation, baseCurrency, actions }: PositionListItemProps): React.JSX.Element {
  const { position, currentPrice, totalNativeValue, totalBaseValue, change, changePercent, fxRate } = valuation;

  // ── Computed Display Values ──

  const icon = ASSET_TYPE_ICONS[position.assetType] ?? Icon.QuestionMarkCircle;
  const typeLabel = ASSET_TYPE_LABELS[position.assetType] ?? "Unknown";

  const isCrossCurrency = position.currency !== baseCurrency;
  const hasPrice = currentPrice > 0;

  // Change colour
  const changeColor = changePercent > 0 ? COLOR_POSITIVE : changePercent < 0 ? COLOR_NEGATIVE : COLOR_NEUTRAL;

  // Subtitle: symbol + units
  const subtitle = `${position.symbol} · ${formatUnits(position.units)} units`;

  // ── Accessories ──
  // Shown on the right side of the list item row (when detail is NOT showing).
  // When detail IS showing, accessories are hidden — all info is in the detail panel.
  // We provide them anyway for fallback / non-detail mode.

  const accessories: List.Item.Accessory[] = [];

  if (hasPrice) {
    // Total value in base currency
    accessories.push({
      text: formatCurrencyCompact(totalBaseValue, baseCurrency),
      tooltip: `Total value: ${formatCurrency(totalBaseValue, baseCurrency)}`,
    });

    // Daily change percentage as a coloured tag
    accessories.push({
      tag: {
        value: formatPercent(changePercent),
        color: changeColor,
      },
      tooltip: `Day change: ${formatCurrency(change, position.currency, { showSign: true })}`,
    });
  } else {
    accessories.push({
      text: { value: "No price", color: Color.SecondaryText },
      tooltip: "Price data not yet available",
    });
  }

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

  // ── Render ──

  return (
    <List.Item
      id={position.id}
      icon={icon}
      title={position.name}
      subtitle={subtitle}
      accessories={accessories}
      detail={detail}
      actions={actions}
    />
  );
}
