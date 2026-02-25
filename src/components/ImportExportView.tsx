/**
 * Import/Export View — main UI for portfolio CSV import and export.
 *
 * Uses single-frame rendering with React state to switch between phases:
 *   1. **Menu** — Choose Export or Import
 *   2. **Export** — Generates CSV and saves to Downloads / clipboard
 *   3. **Import File Path** — User enters a file path manually
 *   4. **Import Preview** — Shows parsed rows, errors, skipped rows, duplicates
 *   5. **Import Done** — Success confirmation
 *
 * Import sources:
 *   - **From Downloads** — Auto-detects the most recent portfolio CSV in ~/Downloads
 *   - **From Clipboard** — Parses CSV content from the system clipboard
 *   - **From File Path** — User enters an absolute path to a CSV file
 *
 * Navigation constraint: no pop()+push() in the same callback.
 * All phase transitions use setState within this single component.
 *
 * @module ImportExportView
 */

import React, { useState, useCallback } from "react";
import {
  List,
  ActionPanel,
  Action,
  Icon,
  showToast,
  Toast,
  Detail,
  Clipboard,
  confirmAlert,
  Alert,
  Form,
  open,
} from "@raycast/api";
import { Portfolio, PortfolioValuation, Account } from "../utils/types";
import {
  exportPortfolioToCsv,
  buildExportData,
  parsePortfolioCsv,
  buildPortfolioFromCsvRows,
  findDuplicates,
  generateExportFilename,
  CsvParseResult,
  CsvImportResult,
  ExportPositionData,
} from "../utils/csv-portfolio";
import { writeFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ──────────────────────────────────────────
// Props
// ──────────────────────────────────────────

interface ImportExportViewProps {
  portfolio: Portfolio | undefined;
  valuation: PortfolioValuation | undefined;
  baseCurrency: string;
  isLoading: boolean;
  onMergeAccounts: (accounts: Account[]) => Promise<void>;
  onRevalidate: () => void;
}

// ──────────────────────────────────────────
// Phase State
// ──────────────────────────────────────────

type Phase =
  | { type: "menu" }
  | { type: "export-done"; csv: string; filename: string; path: string }
  | { type: "import-file-path" }
  | { type: "import-preview"; parseResult: CsvParseResult; importResult: CsvImportResult; sourceLabel: string }
  | { type: "import-done"; importResult: CsvImportResult };

// ──────────────────────────────────────────
// Component
// ──────────────────────────────────────────

export function ImportExportView({
  portfolio,
  valuation,
  // baseCurrency,
  isLoading,
  onMergeAccounts,
  onRevalidate,
}: ImportExportViewProps): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>({ type: "menu" });

  // ── Export Handler ──

  const handleExport = useCallback(async () => {
    if (!portfolio || portfolio.accounts.length === 0) {
      await showToast({ style: Toast.Style.Failure, title: "Nothing to Export", message: "Your portfolio is empty." });
      return;
    }

    await showToast({ style: Toast.Style.Animated, title: "Exporting…" });

    try {
      // Build price map from valuation
      const priceMap = new Map<string, { price: number; totalValue: number }>();
      if (valuation) {
        for (const av of valuation.accounts) {
          for (const pv of av.positions) {
            priceMap.set(pv.position.id, {
              price: pv.currentPrice,
              totalValue: pv.totalNativeValue,
            });
          }
        }
      }

      const exportData: ExportPositionData[] = buildExportData(portfolio, priceMap);
      const csv = exportPortfolioToCsv(exportData);
      const filename = generateExportFilename();

      // Save to ~/Downloads
      const downloadsDir = join(homedir(), "Downloads");
      if (!existsSync(downloadsDir)) {
        mkdirSync(downloadsDir, { recursive: true });
      }
      const filePath = join(downloadsDir, filename);
      writeFileSync(filePath, csv, "utf-8");

      setPhase({ type: "export-done", csv, filename, path: filePath });

      await showToast({
        style: Toast.Style.Success,
        title: "Export Complete",
        message: `Saved to ~/Downloads/${filename}`,
      });
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Export Failed",
        message: String(error),
      });
    }
  }, [portfolio, valuation]);

  // ── Parse CSV content and transition to preview ──

  const handleParseCsv = useCallback(async (content: string, sourceLabel: string) => {
    await showToast({ style: Toast.Style.Animated, title: "Parsing CSV…" });

    try {
      const parseResult = parsePortfolioCsv(content);

      if (parseResult.rows.length === 0 && parseResult.errors.length > 0) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Parse Failed",
          message: `${parseResult.errors.length} error${parseResult.errors.length === 1 ? "" : "s"} found. No valid rows.`,
        });
      }

      const importResult = buildPortfolioFromCsvRows(parseResult.rows);
      setPhase({ type: "import-preview", parseResult, importResult, sourceLabel });

      if (parseResult.rows.length > 0) {
        await showToast({
          style: Toast.Style.Success,
          title: "CSV Parsed",
          message: `${parseResult.rows.length} position${parseResult.rows.length === 1 ? "" : "s"} ready to import.`,
        });
      }
    } catch (error) {
      await showToast({ style: Toast.Style.Failure, title: "Parse Failed", message: String(error) });
    }
  }, []);

  // ── Import from Downloads ──

  const handleImportFromDownloads = useCallback(async () => {
    const downloadsDir = join(homedir(), "Downloads");
    try {
      const files = readdirSync(downloadsDir)
        .filter((f) => f.toLowerCase().endsWith(".csv") && f.toLowerCase().includes("portfolio"))
        .map((f) => ({
          name: f,
          path: join(downloadsDir, f),
          mtime: statSync(join(downloadsDir, f)).mtimeMs,
        }))
        .sort((a, b) => b.mtime - a.mtime);

      if (files.length === 0) {
        await showToast({
          style: Toast.Style.Failure,
          title: "No CSV Found",
          message: 'No files matching "*portfolio*.csv" found in ~/Downloads.',
        });
        return;
      }

      const content = readFileSync(files[0].path, "utf-8");
      await handleParseCsv(content, files[0].name);
    } catch (error) {
      await showToast({ style: Toast.Style.Failure, title: "Failed", message: String(error) });
    }
  }, [handleParseCsv]);

  // ── Import from Clipboard ──

  const handleImportFromClipboard = useCallback(async () => {
    const text = await Clipboard.readText();
    if (!text || text.trim().length === 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Clipboard Empty",
        message: "No text content found in clipboard.",
      });
      return;
    }
    await handleParseCsv(text, "Clipboard");
  }, [handleParseCsv]);

  // ── Import from File Path ──

  const handleImportFromPath = useCallback(
    async (filePath: string) => {
      const trimmedPath = filePath.trim().replace(/^~/, homedir());

      if (!trimmedPath) {
        await showToast({ style: Toast.Style.Failure, title: "No Path", message: "Please enter a file path." });
        return;
      }

      if (!existsSync(trimmedPath)) {
        await showToast({
          style: Toast.Style.Failure,
          title: "File Not Found",
          message: `"${trimmedPath}" does not exist.`,
        });
        return;
      }

      if (!trimmedPath.toLowerCase().endsWith(".csv")) {
        await showToast({ style: Toast.Style.Failure, title: "Invalid File", message: "Please select a .csv file." });
        return;
      }

      try {
        const content = readFileSync(trimmedPath, "utf-8");
        const label = trimmedPath.split("/").pop() ?? trimmedPath;
        await handleParseCsv(content, label);
      } catch (error) {
        await showToast({ style: Toast.Style.Failure, title: "Failed to Read", message: String(error) });
      }
    },
    [handleParseCsv],
  );

  // ── Confirm Import Handler ──

  const handleConfirmImport = useCallback(
    async (importResult: CsvImportResult) => {
      if (!portfolio) return;

      // Check for duplicates
      const duplicates = findDuplicates(portfolio, importResult.portfolio);
      if (duplicates.length > 0) {
        const dupSummary = duplicates
          .slice(0, 5)
          .map((d) => `${d.symbol} in "${d.accountName}"`)
          .join(", ");
        const suffix = duplicates.length > 5 ? ` and ${duplicates.length - 5} more` : "";

        const confirmed = await confirmAlert({
          title: "Duplicate Positions Found",
          message: `These symbols already exist in your portfolio: ${dupSummary}${suffix}. Import will add them as new entries alongside existing ones.`,
          primaryAction: { title: "Import Anyway", style: Alert.ActionStyle.Default },
          dismissAction: { title: "Cancel" },
        });

        if (!confirmed) return;
      }

      await showToast({ style: Toast.Style.Animated, title: "Importing…" });

      try {
        await onMergeAccounts(importResult.portfolio.accounts);
        onRevalidate();

        setPhase({ type: "import-done", importResult });

        await showToast({
          style: Toast.Style.Success,
          title: "Import Complete",
          message: importResult.messages[0] ?? "Portfolio updated.",
        });
      } catch (error) {
        await showToast({ style: Toast.Style.Failure, title: "Import Failed", message: String(error) });
      }
    },
    [portfolio, onMergeAccounts, onRevalidate],
  );

  // ── Render based on phase ──

  switch (phase.type) {
    case "menu":
      return (
        <MenuPhase
          portfolio={portfolio}
          isLoading={isLoading}
          onExport={handleExport}
          onImportFromDownloads={handleImportFromDownloads}
          onImportFromClipboard={handleImportFromClipboard}
          onGoToFilePath={() => setPhase({ type: "import-file-path" })}
        />
      );

    case "export-done":
      return <ExportDonePhase csv={phase.csv} filename={phase.filename} filePath={phase.path} setPhase={setPhase} />;

    case "import-file-path":
      return <FilePathPhase onSubmit={handleImportFromPath} setPhase={setPhase} />;

    case "import-preview":
      return (
        <ImportPreviewPhase
          parseResult={phase.parseResult}
          importResult={phase.importResult}
          sourceLabel={phase.sourceLabel}
          existingPortfolio={portfolio}
          onConfirm={handleConfirmImport}
          setPhase={setPhase}
        />
      );

    case "import-done":
      return <ImportDonePhase importResult={phase.importResult} setPhase={setPhase} />;
  }
}

// ──────────────────────────────────────────
// Phase: Menu
// ──────────────────────────────────────────

function MenuPhase({
  portfolio,
  isLoading,
  onExport,
  onImportFromDownloads,
  onImportFromClipboard,
  onGoToFilePath,
}: {
  portfolio: Portfolio | undefined;
  isLoading: boolean;
  onExport: () => Promise<void>;
  onImportFromDownloads: () => Promise<void>;
  onImportFromClipboard: () => Promise<void>;
  onGoToFilePath: () => void;
}): React.JSX.Element {
  const positionCount = portfolio?.accounts.reduce((sum, a) => sum + a.positions.length, 0) ?? 0;
  const accountCount = portfolio?.accounts.length ?? 0;

  return (
    <List isLoading={isLoading} navigationTitle="Import / Export Portfolio">
      <List.Section title="Export" subtitle="Save your portfolio to CSV">
        <List.Item
          icon={Icon.Upload}
          title="Export Portfolio to CSV"
          subtitle={`${positionCount} position${positionCount === 1 ? "" : "s"} across ${accountCount} account${accountCount === 1 ? "" : "s"}`}
          accessories={[{ text: "~/Downloads", icon: Icon.Folder }]}
          actions={
            <ActionPanel>
              <Action title="Export to CSV" icon={Icon.Upload} onAction={onExport} />
            </ActionPanel>
          }
        />
      </List.Section>

      <List.Section title="Import" subtitle="Load positions from CSV">
        <List.Item
          icon={Icon.Download}
          title="Import from Downloads"
          subtitle='Auto-detect most recent "portfolio*.csv"'
          accessories={[{ text: "~/Downloads", icon: Icon.Folder }]}
          actions={
            <ActionPanel>
              <Action title="Import from Downloads" icon={Icon.Download} onAction={onImportFromDownloads} />
            </ActionPanel>
          }
        />
        <List.Item
          icon={Icon.Clipboard}
          title="Import from Clipboard"
          subtitle="Paste CSV content from clipboard"
          actions={
            <ActionPanel>
              <Action
                title="Import from Clipboard"
                icon={Icon.Clipboard}
                shortcut={{ modifiers: ["cmd", "shift"], key: "v" }}
                onAction={onImportFromClipboard}
              />
            </ActionPanel>
          }
        />
        <List.Item
          icon={Icon.TextDocument}
          title="Import from File Path"
          subtitle="Enter the full path to a CSV file"
          actions={
            <ActionPanel>
              <Action
                title="Enter File Path"
                icon={Icon.TextDocument}
                shortcut={{ modifiers: ["cmd", "shift"], key: "o" }}
                onAction={onGoToFilePath}
              />
            </ActionPanel>
          }
        />
      </List.Section>

      <List.Section title="Info">
        <List.Item
          icon={Icon.QuestionMarkCircle}
          title="CSV Format"
          subtitle="Account, Account Type, Asset Name, Symbol, Units, Price, Total Value, Currency, Asset Type, Last Updated"
          actions={
            <ActionPanel>
              <Action.CopyToClipboard
                title="Copy Header Row"
                content="Account,Account Type,Asset Name,Symbol,Units,Price,Total Value,Currency,Asset Type,Last Updated"
                shortcut={{ modifiers: ["cmd"], key: "h" }}
              />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}

// ──────────────────────────────────────────
// Phase: File Path Input
// ──────────────────────────────────────────

function FilePathPhase({
  onSubmit,
  setPhase,
}: {
  onSubmit: (path: string) => Promise<void>;
  setPhase: React.Dispatch<React.SetStateAction<Phase>>;
}): React.JSX.Element {
  return (
    <Form
      navigationTitle="Import — Enter File Path"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Import CSV"
            icon={Icon.Download}
            onSubmit={(values: { filePath: string }) => onSubmit(values.filePath)}
          />
          <Action
            title="Back to Menu"
            icon={Icon.ArrowLeft}
            shortcut={{ modifiers: ["cmd"], key: "backspace" }}
            onAction={() => setPhase({ type: "menu" })}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="filePath"
        title="CSV File Path"
        placeholder="/path/to/portfolio.csv  or  ~/Downloads/portfolio-export-2025-07-15.csv"
        info="Enter the absolute path to a CSV file. Supports ~ for home directory."
      />
      <Form.Description title="Required Columns" text="Account, Asset Name, Symbol, Units, Currency" />
      <Form.Description title="Optional Columns" text="Account Type, Price, Total Value, Asset Type, Last Updated" />
    </Form>
  );
}

// ──────────────────────────────────────────
// Phase: Export Done
// ──────────────────────────────────────────

function ExportDonePhase({
  csv,
  filename,
  filePath,
  setPhase,
}: {
  csv: string;
  filename: string;
  filePath: string;
  setPhase: React.Dispatch<React.SetStateAction<Phase>>;
}): React.JSX.Element {
  const lineCount = csv.split("\n").length;
  const positionCount = lineCount - 1; // Subtract header

  // Build a preview of the first 10 data rows
  const allLines = csv.split("\n");
  const previewLines = allLines.slice(0, 11);
  const remaining = allLines.length - 11;

  const markdown = [
    "# ✅ Export Complete",
    "",
    `**File:** \`${filename}\``,
    "**Location:** `~/Downloads/`",
    `**Positions:** ${positionCount}`,
    `**Size:** ${(csv.length / 1024).toFixed(1)} KB`,
    "",
    "---",
    "",
    "### Preview (first 10 rows)",
    "",
    "```",
    ...previewLines,
    "```",
    "",
    remaining > 0 ? `*…and ${remaining} more rows*` : "",
  ].join("\n");

  return (
    <Detail
      navigationTitle="Export Complete"
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action title="Open in Finder" icon={Icon.Finder} onAction={() => open(filePath)} />
          <Action
            title="Copy CSV to Clipboard"
            icon={Icon.Clipboard}
            shortcut={{ modifiers: ["cmd"], key: "c" }}
            onAction={async () => {
              await Clipboard.copy(csv);
              await showToast({ style: Toast.Style.Success, title: "Copied to Clipboard" });
            }}
          />
          <Action
            title="Back to Menu"
            icon={Icon.ArrowLeft}
            shortcut={{ modifiers: ["cmd"], key: "backspace" }}
            onAction={() => setPhase({ type: "menu" })}
          />
        </ActionPanel>
      }
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="File" text={filename} icon={Icon.Document} />
          <Detail.Metadata.Label title="Location" text="~/Downloads/" icon={Icon.Folder} />
          <Detail.Metadata.Label title="Positions" text={String(positionCount)} icon={Icon.List} />
          <Detail.Metadata.Label title="Size" text={`${(csv.length / 1024).toFixed(1)} KB`} icon={Icon.HardDrive} />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="Format" text="CSV (RFC 4180)" icon={Icon.TextDocument} />
          <Detail.Metadata.Label title="Encoding" text="UTF-8" icon={Icon.Text} />
        </Detail.Metadata>
      }
    />
  );
}

// ──────────────────────────────────────────
// Phase: Import Preview
// ──────────────────────────────────────────

function ImportPreviewPhase({
  parseResult,
  importResult,
  sourceLabel,
  existingPortfolio,
  onConfirm,
  setPhase,
}: {
  parseResult: CsvParseResult;
  importResult: CsvImportResult;
  sourceLabel: string;
  existingPortfolio: Portfolio | undefined;
  onConfirm: (result: CsvImportResult) => Promise<void>;
  setPhase: React.Dispatch<React.SetStateAction<Phase>>;
}): React.JSX.Element {
  const { rows, errors, skipped, totalRawRows } = parseResult;
  const hasErrors = errors.length > 0;
  const hasSkipped = skipped.length > 0;
  const canImport = rows.length > 0;

  // Check duplicates against existing portfolio
  const duplicates = existingPortfolio ? findDuplicates(existingPortfolio, importResult.portfolio) : [];
  const hasDuplicates = duplicates.length > 0;

  // ── Build summary markdown ──
  const lines: string[] = [];
  lines.push("# 📋 Import Preview");
  lines.push("");
  lines.push(`**Source:** \`${sourceLabel}\``);
  lines.push("");

  // Stats table
  lines.push("### Summary");
  lines.push("");
  lines.push("| Metric | Count |");
  lines.push("|--------|-------|");
  lines.push(`| Total rows parsed | ${totalRawRows} |`);
  lines.push(`| ✅ Valid positions | ${rows.length} |`);
  if (hasErrors) lines.push(`| ❌ Errors | ${errors.length} |`);
  if (hasSkipped) lines.push(`| ⏭️ Skipped | ${skipped.length} |`);
  lines.push(`| 📁 Accounts | ${importResult.accountCount} |`);
  if (hasDuplicates) lines.push(`| ⚠️ Duplicates | ${duplicates.length} |`);
  lines.push("");

  // Positions preview
  if (rows.length > 0) {
    lines.push("### Positions to Import");
    lines.push("");
    lines.push("| Account | Asset | Symbol | Units | Currency |");
    lines.push("|---------|-------|--------|-------|----------|");
    const displayRows = rows.slice(0, 20);
    for (const row of displayRows) {
      lines.push(`| ${row.accountName} | ${row.assetName} | ${row.symbol} | ${row.units} | ${row.currency} |`);
    }
    if (rows.length > 20) {
      lines.push(`| *…and ${rows.length - 20} more* | | | | |`);
    }
    lines.push("");
  }

  // Duplicates warning
  if (hasDuplicates) {
    lines.push("### ⚠️ Duplicate Positions");
    lines.push("");
    lines.push("These symbols already exist in your portfolio and will be added as new entries:");
    lines.push("");
    for (const dup of duplicates.slice(0, 10)) {
      lines.push(`- **${dup.symbol}** in "${dup.accountName}" (${dup.existingCount} existing)`);
    }
    if (duplicates.length > 10) {
      lines.push(`- *…and ${duplicates.length - 10} more*`);
    }
    lines.push("");
  }

  // Errors
  if (hasErrors) {
    lines.push("### ❌ Errors");
    lines.push("");
    for (const err of errors.slice(0, 15)) {
      const rawVal = err.rawValue ? ` (got: \`${err.rawValue}\`)` : "";
      lines.push(`- **Row ${err.row}**, ${err.column}: ${err.message}${rawVal}`);
    }
    if (errors.length > 15) {
      lines.push(`- *…and ${errors.length - 15} more errors*`);
    }
    lines.push("");
  }

  // Skipped
  if (hasSkipped) {
    lines.push("### ⏭️ Skipped Rows");
    lines.push("");
    for (const skip of skipped.slice(0, 10)) {
      lines.push(`- **Row ${skip.row}**: ${skip.reason}`);
    }
    if (skipped.length > 10) {
      lines.push(`- *…and ${skipped.length - 10} more skipped*`);
    }
    lines.push("");
  }

  return (
    <Detail
      navigationTitle="Import Preview"
      markdown={lines.join("\n")}
      actions={
        <ActionPanel>
          {canImport && (
            <Action
              title={`Import ${rows.length} Position${rows.length === 1 ? "" : "s"}`}
              icon={Icon.Download}
              onAction={() => onConfirm(importResult)}
            />
          )}
          <Action
            title="Back to Menu"
            icon={Icon.ArrowLeft}
            shortcut={{ modifiers: ["cmd"], key: "backspace" }}
            onAction={() => setPhase({ type: "menu" })}
          />
        </ActionPanel>
      }
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Source" text={sourceLabel} icon={Icon.Document} />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="Valid Positions" text={String(rows.length)} icon={Icon.Checkmark} />
          <Detail.Metadata.Label title="Accounts" text={String(importResult.accountCount)} icon={Icon.TwoPeople} />
          {hasErrors && <Detail.Metadata.Label title="Errors" text={String(errors.length)} icon={Icon.XMarkCircle} />}
          {hasSkipped && (
            <Detail.Metadata.Label title="Skipped" text={String(skipped.length)} icon={Icon.ArrowRightCircle} />
          )}
          {hasDuplicates && (
            <Detail.Metadata.Label title="Duplicates" text={String(duplicates.length)} icon={Icon.Warning} />
          )}
        </Detail.Metadata>
      }
    />
  );
}

// ──────────────────────────────────────────
// Phase: Import Done
// ──────────────────────────────────────────

function ImportDonePhase({
  importResult,
  setPhase,
}: {
  importResult: CsvImportResult;
  setPhase: React.Dispatch<React.SetStateAction<Phase>>;
}): React.JSX.Element {
  const markdown = [
    "# ✅ Import Complete",
    "",
    importResult.messages.map((m) => `> ${m}`).join("\n"),
    "",
    "---",
    "",
    `**Accounts:** ${importResult.accountCount}`,
    `**Positions:** ${importResult.positionCount}`,
    "",
    "Your portfolio has been updated. Switch to the **Portfolio Tracker** command to see your imported positions.",
    "",
    "*Prices will be fetched automatically when you open Portfolio Tracker.*",
  ].join("\n");

  return (
    <Detail
      navigationTitle="Import Complete"
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action title="Back to Menu" icon={Icon.ArrowLeft} onAction={() => setPhase({ type: "menu" })} />
        </ActionPanel>
      }
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Accounts" text={String(importResult.accountCount)} icon={Icon.TwoPeople} />
          <Detail.Metadata.Label title="Positions" text={String(importResult.positionCount)} icon={Icon.List} />
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="Status" text="Complete" icon={Icon.Checkmark} />
        </Detail.Metadata>
      }
    />
  );
}
