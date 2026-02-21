/**
 * PositionActions component.
 *
 * Per-position action panel items displayed when the user selects a specific
 * position (holding) within an account. Provides actions for managing the
 * individual position — editing units or removing it entirely.
 *
 * These actions are rendered as an ActionPanel.Section and can be composed
 * alongside PortfolioActions and AccountActions in the same ActionPanel.
 *
 * Features:
 * - Edit Units — navigates to an edit form to change the number of units held
 * - Remove Position — removes the position with confirmation alert
 * - Copy Symbol — copies the Yahoo Finance symbol to clipboard
 * - Copy Name — copies the asset name to clipboard
 *
 * Usage:
 * ```tsx
 * <ActionPanel>
 *   <PositionActions
 *     position={position}
 *     accountId={account.id}
 *     onEditPosition={() => push(<EditPositionForm ... />)}
 *     onDeletePosition={() => removePosition(account.id, position.id)}
 *   />
 * </ActionPanel>
 * ```
 */

import React from "react";
import { Action, ActionPanel, Alert, Color, Icon, confirmAlert } from "@raycast/api";
import { Position } from "../../utils/types";
import { ASSET_TYPE_LABELS } from "../../utils/constants";
import { formatUnits } from "../../utils/formatting";

// ──────────────────────────────────────────
// Props
// ──────────────────────────────────────────

interface PositionActionsProps {
  /** The position these actions apply to */
  position: Position;

  /** The ID of the account that contains this position */
  accountId: string;

  /**
   * Callback to navigate to the edit form for this position.
   * Typically pushes an EditPositionForm onto the navigation stack.
   */
  onEditPosition: () => void;

  /**
   * Callback to delete this position from the account.
   * The component handles the confirmation dialog internally.
   */
  onDeletePosition: () => Promise<void>;
}

// ──────────────────────────────────────────
// Component
// ──────────────────────────────────────────

/**
 * Per-position actions rendered in an ActionPanel.Section.
 *
 * Actions:
 * 1. Edit Units — modify the number of units held in this position
 * 2. Remove Position — delete with confirmation (destructive)
 * 3. Copy Symbol — copies the Yahoo Finance symbol to clipboard
 * 4. Copy Name — copies the asset name to clipboard
 *
 * The delete action shows a confirmation alert before proceeding,
 * displaying the position name and current units for clarity.
 *
 * Keyboard shortcuts:
 * - ⌘E → Edit Units
 * - ⌃X → Remove Position (with confirmation)
 * - ⌘C → Copy Symbol
 * - ⇧⌘C → Copy Name
 */
export function PositionActions({
  position,
  accountId,
  onEditPosition,
  onDeletePosition,
}: PositionActionsProps): React.JSX.Element {
  const typeLabel = ASSET_TYPE_LABELS[position.assetType] ?? "Position";

  /**
   * Shows a confirmation dialog before removing the position.
   * Displays the asset name and current unit count for the user to verify.
   */
  async function handleDeleteWithConfirmation() {
    const confirmed = await confirmAlert({
      title: `Remove "${position.name}"?`,
      message: `This will remove ${formatUnits(position.units)} unit${position.units === 1 ? "" : "s"} of ${position.symbol} from your account. This action cannot be undone.`,
      icon: { source: Icon.Trash, tintColor: Color.Red },
      primaryAction: {
        title: "Remove Position",
        style: Alert.ActionStyle.Destructive,
      },
      dismissAction: {
        title: "Cancel",
      },
    });

    if (confirmed) {
      await onDeletePosition();
    }
  }

  return (
    <>
      <ActionPanel.Section title={`${position.name} (${position.symbol})`}>
        <Action
          title="Edit Units"
          icon={Icon.Pencil}
          shortcut={{ modifiers: ["cmd"], key: "e" }}
          onAction={onEditPosition}
        />

        <Action
          title="Remove Position"
          icon={Icon.Trash}
          style={Action.Style.Destructive}
          shortcut={{ modifiers: ["ctrl"], key: "x" }}
          onAction={handleDeleteWithConfirmation}
        />
      </ActionPanel.Section>

      <ActionPanel.Section title="Copy">
        <Action.CopyToClipboard
          title="Copy Symbol"
          content={position.symbol}
          shortcut={{ modifiers: ["cmd"], key: "c" }}
        />

        <Action.CopyToClipboard
          title="Copy Name"
          content={position.name}
          shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
        />
      </ActionPanel.Section>
    </>
  );
}
