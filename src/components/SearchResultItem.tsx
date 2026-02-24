/**
 * SearchResultItem component.
 *
 * Renders a single search result row in the investment search list.
 * Displays the asset name, symbol, type badge, and exchange information.
 *
 * When the user selects a result, it navigates to the AssetConfirmation view
 * where they can see asset details and specify how many units to add.
 *
 * Features:
 * - Asset name as the main title
 * - Symbol as subtitle (e.g. "VUSA.L")
 * - Asset type tag with colour coding (Stock, ETF, Mutual Fund, etc.)
 * - Exchange shown as an accessory (e.g. "LSE", "NMS")
 * - Action to select/confirm the asset for adding to portfolio
 *
 * Usage:
 * ```tsx
 * <SearchResultItem
 *   result={searchResult}
 *   onSelect={(result) => push(<AssetConfirmation result={result} accountId={id} />)}
 * />
 * ```
 */

import React from "react";
import { Action, ActionPanel, Color, Icon, List } from "@raycast/api";
import { AssetSearchResult, AssetType } from "../utils/types";
import { ASSET_TYPE_LABELS } from "../utils/constants";

// ──────────────────────────────────────────
// Props
// ──────────────────────────────────────────

interface SearchResultItemProps {
  /** The search result data to display */
  result: AssetSearchResult;

  /**
   * Callback fired when the user selects this result.
   * Typically navigates to the AssetConfirmation view.
   */
  onSelect: (result: AssetSearchResult) => void;
}

// ──────────────────────────────────────────
// Asset Type → Colour Mapping
// ──────────────────────────────────────────

/**
 * Maps asset types to display colours for the type tag.
 * Uses Raycast's built-in Color values for consistency with the design system.
 */
const ASSET_TYPE_COLORS: Record<AssetType, Color.ColorLike> = {
  [AssetType.EQUITY]: Color.Blue,
  [AssetType.ETF]: Color.Green,
  [AssetType.MUTUALFUND]: Color.Purple,
  [AssetType.INDEX]: Color.Orange,
  [AssetType.CURRENCY]: Color.Yellow,
  [AssetType.CRYPTOCURRENCY]: Color.Magenta,
  [AssetType.OPTION]: Color.Red,
  [AssetType.FUTURE]: Color.Red,
  [AssetType.CASH]: Color.Green,
  [AssetType.MORTGAGE]: Color.Orange,
  [AssetType.OWNED_PROPERTY]: Color.Orange,
  [AssetType.UNKNOWN]: Color.SecondaryText,
};

/**
 * Maps asset types to icons for the list item.
 */
const ASSET_TYPE_ICONS: Record<AssetType, Icon> = {
  [AssetType.EQUITY]: Icon.Building,
  [AssetType.ETF]: Icon.BarChart,
  [AssetType.MUTUALFUND]: Icon.BankNote,
  [AssetType.INDEX]: Icon.LineChart,
  [AssetType.CURRENCY]: Icon.Coins,
  [AssetType.CRYPTOCURRENCY]: Icon.Crypto,
  [AssetType.OPTION]: Icon.Switch,
  [AssetType.FUTURE]: Icon.Calendar,
  [AssetType.CASH]: Icon.BankNote,
  [AssetType.MORTGAGE]: Icon.House,
  [AssetType.OWNED_PROPERTY]: Icon.House,
  [AssetType.UNKNOWN]: Icon.QuestionMarkCircle,
};

// ──────────────────────────────────────────
// Component
// ──────────────────────────────────────────

/**
 * Renders a single search result as a List.Item.
 *
 * Layout:
 * ```
 * [icon] Asset Name                    ETF  |  LSE
 *        VUSA.L
 * ```
 *
 * - Icon: determined by asset type (building for stocks, chart for ETFs, etc.)
 * - Title: human-readable asset name
 * - Subtitle: Yahoo Finance symbol
 * - Accessories: asset type tag (coloured) + exchange name
 */
export function SearchResultItem({ result, onSelect }: SearchResultItemProps): React.JSX.Element {
  const typeLabel = ASSET_TYPE_LABELS[result.type] ?? "Unknown";
  const typeColor = ASSET_TYPE_COLORS[result.type] ?? Color.SecondaryText;
  const icon = ASSET_TYPE_ICONS[result.type] ?? Icon.QuestionMarkCircle;

  return (
    <List.Item
      id={result.symbol}
      icon={icon}
      title={result.name}
      subtitle={result.symbol}
      accessories={[
        {
          tag: { value: typeLabel, color: typeColor },
          tooltip: `Type: ${typeLabel}`,
        },
        {
          text: result.exchange,
          tooltip: `Exchange: ${result.exchange}`,
        },
      ]}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action title="Select Investment" icon={Icon.PlusCircle} onAction={() => onSelect(result)} />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action.CopyToClipboard
              title="Copy Symbol"
              content={result.symbol}
              shortcut={{ modifiers: ["cmd"], key: "c" }}
            />
            <Action.CopyToClipboard
              title="Copy Name"
              content={result.name}
              shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}
