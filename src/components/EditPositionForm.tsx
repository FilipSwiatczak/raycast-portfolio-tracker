/**
 * EditPositionForm component.
 *
 * A Raycast Form view for editing the number of units held in an existing position.
 * This is the simplest form in the extension — it shows the current position details
 * as read-only context and provides a single editable field for the unit count.
 *
 * Features:
 * - Displays current position info (name, symbol, currency, current units)
 * - Pre-populated units field with the current value
 * - Validation for the units input (positive number, max 6 decimal places)
 * - Toast notification on successful update
 * - Automatic navigation pop on submission
 *
 * Usage:
 * ```tsx
 * <EditPositionForm
 *   position={position}
 *   accountId={account.id}
 *   accountName={account.name}
 *   onSubmit={async (units) => { await updatePosition(account.id, position.id, units); }}
 * />
 * ```
 */

import React from "react";
import { Form, ActionPanel, Action, Icon, useNavigation } from "@raycast/api";
import { useState } from "react";
import { Position, AssetType } from "../utils/types";
import { ASSET_TYPE_LABELS } from "../utils/constants";
import { validateUnits, parseUnits } from "../utils/validation";
import { formatUnits, formatCurrency } from "../utils/formatting";

// ──────────────────────────────────────────
// Props
// ──────────────────────────────────────────

interface EditPositionFormProps {
  /** The position to edit */
  position: Position;

  /** The ID of the account containing this position */
  accountId: string;

  /** The name of the account (for display context) */
  accountName: string;

  /**
   * Callback fired when the form is submitted with a valid units value.
   *
   * @param units - The new number of units (already parsed and validated)
   */
  onSubmit: (units: number) => Promise<void>;
}

// ──────────────────────────────────────────
// Component
// ──────────────────────────────────────────

/**
 * Form for editing the unit count of an existing position.
 *
 * Renders a Raycast Form with:
 * - Read-only context: asset name, symbol, type, account, currency
 * - Editable field: number of units (pre-populated with current value)
 * - Submit action that validates and calls `onSubmit`
 *
 * On successful submission, the form automatically navigates back (pops).
 */
export function EditPositionForm({
  position,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  accountId,
  accountName,
  onSubmit,
}: EditPositionFormProps): React.JSX.Element {
  const { pop } = useNavigation();

  // ── Form State ──

  const [unitsError, setUnitsError] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Display Values ──

  const typeLabel = ASSET_TYPE_LABELS[position.assetType] ?? "Unknown";
  const isCash = position.assetType === AssetType.CASH;
  const currentUnitsDisplay = isCash ? formatCurrency(position.units, position.currency) : formatUnits(position.units);

  // Context-aware labels
  const fieldTitle = isCash ? "Cash Amount" : "Number of Units";
  const fieldPlaceholder = isCash ? "e.g. 500, 1250.50, 10000" : "e.g. 50, 12.5, 0.25";
  const helpText = isCash
    ? `Current balance: ${currentUnitsDisplay}. Enter the new total cash balance.`
    : `Current holding: ${currentUnitsDisplay} units. Enter the new total number of units you hold.`;

  // ── Validation ──

  /**
   * Validates the units field on blur (when the user tabs away).
   * Provides immediate feedback for invalid input.
   */
  function handleUnitsBlur(event: Form.Event<string>) {
    const value = event.target.value;
    if (value && value.trim().length > 0) {
      const error = validateUnits(value);
      setUnitsError(error);
    }
  }

  /**
   * Clears the validation error as soon as the user starts typing.
   * This prevents stale error messages from lingering while the user corrects input.
   */
  function handleUnitsChange() {
    if (unitsError) {
      setUnitsError(undefined);
    }
  }

  // ── Submission ──

  async function handleSubmit(values: { units: string }) {
    // Validate the input
    const unitValidation = validateUnits(values.units);
    if (unitValidation) {
      setUnitsError(unitValidation);
      return;
    }

    const newUnits = parseUnits(values.units);

    // Skip the API call if units haven't changed
    if (newUnits === position.units) {
      pop();
      return;
    }

    setIsSubmitting(true);

    try {
      await onSubmit(newUnits);
      pop();
    } catch (error) {
      console.error("EditPositionForm submission failed:", error);
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Render ──

  return (
    <Form
      navigationTitle={`Edit ${position.name}`}
      isLoading={isSubmitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Save Changes" icon={Icon.Check} onSubmit={handleSubmit} />
          <Action title="Cancel" icon={Icon.XMarkCircle} onAction={pop} shortcut={{ modifiers: ["cmd"], key: "." }} />
        </ActionPanel>
      }
    >
      {/* ── Read-Only Context ── */}
      <Form.Description title="Asset" text={position.name} />
      {!isCash && <Form.Description title="Symbol" text={position.symbol} />}
      <Form.Description title="Type" text={typeLabel} />
      <Form.Description title="Currency" text={position.currency} />
      <Form.Description title="Account" text={accountName} />

      <Form.Separator />

      {/* ── Editable Field ── */}
      <Form.TextField
        id="units"
        title={fieldTitle}
        placeholder={fieldPlaceholder}
        defaultValue={isCash ? String(position.units) : currentUnitsDisplay}
        error={unitsError}
        onChange={handleUnitsChange}
        onBlur={handleUnitsBlur}
        autoFocus
      />

      <Form.Description title="" text={helpText} />
    </Form>
  );
}
