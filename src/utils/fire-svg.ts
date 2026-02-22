/**
 * SVG chart builder for the FIRE projection.
 *
 * Generates a stacked horizontal bar chart as an SVG string with two
 * colour-coded data series per year:
 *
 *   - **Portfolio Growth** (white/dark) — compound growth on existing holdings
 *     assuming zero contributions.
 *   - **Contribution Impact** (blue) — cumulative value of all contributions
 *     plus the compound growth earned on those contributions.
 *
 * The two series are visually stacked: growth on the left, contributions on
 * the right, so each bar's total width represents the full projected value.
 *
 * Additional visual elements:
 *   - Vertical dashed target line at the FIRE target value
 *   - Green highlight row for the FIRE year
 *   - Legend at the bottom
 *   - Year labels (left), value labels (right)
 *
 * Colour handling:
 *   All colours are stored as `{ hex, opacity }` pairs and emitted using
 *   SVG-native `fill` + `fill-opacity` (or `stroke` + `stroke-opacity`)
 *   presentation attributes. This avoids `rgba()` which is a CSS3 value
 *   **not** recognised by SVG 1.1 presentation attribute parsers — Raycast's
 *   WebKit `<img>` renderer silently falls back to black for unrecognised
 *   fill values.
 *
 * Theme handling:
 *   The SVG embeds CSS `@media (prefers-color-scheme)` rules so it
 *   **self-adapts** to the OS/Raycast appearance regardless of what
 *   `environment.appearance` reports at build time. The `theme` parameter
 *   in `ChartConfig` still controls the inline SVG presentation attributes
 *   which act as a fallback for renderers that do not support CSS media
 *   queries inside `<img>`-loaded SVGs. In Raycast's WebKit-based Detail
 *   view the CSS rules take priority over the inline attributes, ensuring
 *   the chart always matches the active colour scheme.
 *
 * Zero side effects, zero Raycast imports. Fully testable.
 * The SVG string is intended to be base64-encoded and embedded in Raycast
 * Detail markdown via: `![](data:image/svg+xml;base64,…)`
 *
 * @module fire-svg
 */

// ──────────────────────────────────────────
// Public Types
// ──────────────────────────────────────────

/**
 * A single bar in the stacked projection chart.
 *
 * Pre-computed by the caller (fire-charts.ts) from the projection data
 * so this module has zero dependency on fire-types or fire-calculator.
 */
export interface ChartBar {
  /** Calendar year (e.g. 2025) */
  year: number;

  /** Pre-formatted value label for the right side (e.g. "£420K") */
  label: string;

  /**
   * Total projected portfolio value (used for bar width scaling).
   * Must equal `baseGrowthValue + contributionValue`.
   */
  totalValue: number;

  /**
   * Value attributable to compound growth on the initial portfolio
   * (what the portfolio would be worth with zero contributions).
   */
  baseGrowthValue: number;

  /**
   * Value attributable to contributions and their compound growth
   * (totalValue − baseGrowthValue).
   */
  contributionValue: number;

  /** True only for the first year the target is hit */
  isFireYear: boolean;
}

/** Configuration passed alongside the bar data. */
export interface ChartConfig {
  /** The FIRE target portfolio value (for the vertical marker line) */
  targetValue: number;

  /** Pre-formatted target label (e.g. "£1.0M") */
  targetLabel: string;

  /**
   * Raycast appearance hint — sets the inline presentation-attribute
   * fallback colours. The embedded CSS `@media (prefers-color-scheme)`
   * rules override these when the renderer supports them (Raycast does).
   */
  theme: "light" | "dark";
}

// ──────────────────────────────────────────
// SVG Colour Type
// ──────────────────────────────────────────

/**
 * An SVG-safe colour: hex string + separate opacity.
 *
 * SVG 1.1 presentation attributes (`fill`, `stroke`) do NOT accept
 * CSS3 `rgba()` — only hex, `rgb()`, or named colours. Transparency
 * must be expressed via the companion `fill-opacity` / `stroke-opacity`
 * attribute. This type enforces that separation at the data level.
 */
interface SvgColor {
  /** Hex colour string, e.g. "#FFFFFF" */
  hex: string;
  /** Opacity 0–1 (1 = fully opaque) */
  opacity: number;
}

// ──────────────────────────────────────────
// Theme Palettes
// ──────────────────────────────────────────

interface ThemePalette {
  /** Explicit background fill for the entire SVG (matches Raycast theme) */
  background: SvgColor;
  /** Subtle background track behind each bar row */
  barTrack: SvgColor;
  /** Colour for the base growth (compound on existing portfolio) segment */
  baseGrowth: SvgColor;
  /** Colour for the contribution impact segment */
  contributions: SvgColor;
  /** Colour for the target value vertical marker line */
  targetLine: SvgColor;
  /** Semi-transparent row highlight for the FIRE year */
  fireHighlight: SvgColor;
  /** Accent colour for the FIRE year label */
  fireAccent: SvgColor;
  /** Primary text colour (year / value labels) */
  text: SvgColor;
  /** Muted text for secondary info */
  mutedText: SvgColor;
  /** Legend label text */
  legendText: SvgColor;
}

/** Shorthand: fully opaque colour */
function solid(hex: string): SvgColor {
  return { hex, opacity: 1 };
}

const PALETTES: Record<"light" | "dark", ThemePalette> = {
  dark: {
    background: solid("#1C1C1E"),
    barTrack: { hex: "#FFFFFF", opacity: 0.06 },
    baseGrowth: { hex: "#FFFFFF", opacity: 0.75 },
    contributions: solid("#4A9EFF"),
    targetLine: solid("#FF9F0A"),
    fireHighlight: { hex: "#34C759", opacity: 0.12 },
    fireAccent: solid("#34C759"),
    text: { hex: "#FFFFFF", opacity: 0.82 },
    mutedText: { hex: "#FFFFFF", opacity: 0.45 },
    legendText: { hex: "#FFFFFF", opacity: 0.6 },
  },
  light: {
    background: solid("#FFFFFF"),
    barTrack: { hex: "#000000", opacity: 0.06 },
    baseGrowth: { hex: "#000000", opacity: 0.55 },
    contributions: solid("#007AFF"),
    targetLine: solid("#FF9500"),
    fireHighlight: { hex: "#34C759", opacity: 0.1 },
    fireAccent: solid("#34C759"),
    text: { hex: "#000000", opacity: 0.82 },
    mutedText: { hex: "#000000", opacity: 0.45 },
    legendText: { hex: "#000000", opacity: 0.6 },
  },
};

// ──────────────────────────────────────────
// SVG Attribute Helpers
// ──────────────────────────────────────────

/**
 * Emits SVG `fill` + optional `fill-opacity` presentation attributes.
 *
 * @example
 *   fillAttr({ hex: "#FFF", opacity: 0.75 })
 *   // → 'fill="#FFF" fill-opacity="0.75"'
 *
 *   fillAttr({ hex: "#1C1C1E", opacity: 1 })
 *   // → 'fill="#1C1C1E"'
 */
function fillAttr(c: SvgColor): string {
  if (c.opacity < 1) {
    return `fill="${c.hex}" fill-opacity="${c.opacity}"`;
  }
  return `fill="${c.hex}"`;
}

/**
 * Emits SVG `stroke` + optional `stroke-opacity` presentation attributes.
 */
function strokeAttr(c: SvgColor): string {
  if (c.opacity < 1) {
    return `stroke="${c.hex}" stroke-opacity="${c.opacity}"`;
  }
  return `stroke="${c.hex}"`;
}

/**
 * Emits a CSS `fill` + optional `fill-opacity` rule body (no selector).
 *
 * @example
 *   cssFillRule({ hex: "#FFF", opacity: 0.75 })
 *   // → 'fill: #FFF; fill-opacity: 0.75;'
 */
function cssFillRule(c: SvgColor): string {
  if (c.opacity < 1) {
    return `fill: ${c.hex}; fill-opacity: ${c.opacity};`;
  }
  return `fill: ${c.hex};`;
}

/**
 * Emits a CSS `stroke` + optional `stroke-opacity` rule body.
 */
function cssStrokeRule(c: SvgColor): string {
  if (c.opacity < 1) {
    return `stroke: ${c.hex}; stroke-opacity: ${c.opacity};`;
  }
  return `stroke: ${c.hex};`;
}

// ──────────────────────────────────────────
// CSS Class Names
// ──────────────────────────────────────────

/**
 * CSS class constants applied to themed SVG elements.
 *
 * Each class is targeted by `@media (prefers-color-scheme)` rules
 * embedded in the SVG's `<defs><style>` block. The matching inline
 * `fill`/`stroke` presentation attributes serve as a fallback for
 * renderers that ignore CSS in SVG images.
 */
const CLS = {
  bg: "c-bg",
  track: "c-track",
  base: "c-base",
  contrib: "c-contrib",
  target: "c-target",
  fireHl: "c-fire-hl",
  fire: "c-fire",
  text: "c-text",
  muted: "c-muted",
  legend: "c-legend",
} as const;

// ──────────────────────────────────────────
// Layout Constants
// ──────────────────────────────────────────

/** Total SVG width in px */
const SVG_WIDTH = 700;

/** Padding around the chart area */
const PADDING = { top: 8, right: 82, bottom: 38, left: 50 };

/** Height of each horizontal bar */
const BAR_HEIGHT = 18;

/** Vertical gap between bars */
const BAR_GAP = 3;

/** Combined row height (bar + gap) */
const ROW_HEIGHT = BAR_HEIGHT + BAR_GAP;

/** Usable width for the bar graphics */
const BAR_AREA_WIDTH = SVG_WIDTH - PADDING.left - PADDING.right;

/** Font used for all text labels */
const FONT_FAMILY = "-apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif";

/** Font size for year and value labels */
const FONT_SIZE_LABEL = 12;

/** Font size for legend text */
const FONT_SIZE_LEGEND = 11;

/** Height reserved for the legend row */
const LEGEND_HEIGHT = 24;

/** Horizontal gap between legend items */
const LEGEND_ITEM_GAP = 16;

/** Size of the legend colour swatch square */
const LEGEND_SWATCH = 10;

// ──────────────────────────────────────────
// CSS Builder
// ──────────────────────────────────────────

/**
 * Builds the `<defs><style>` block containing both light and dark
 * palette rules keyed to `@media (prefers-color-scheme)`.
 *
 * Both schemes are inside their respective media queries so that if
 * the renderer does NOT support `prefers-color-scheme` at all, neither
 * block matches and the inline presentation attributes (set from the
 * `theme` param) remain in control — giving us a robust fallback.
 *
 * When the renderer DOES support the media query (Raycast/WebKit does),
 * the matching block's CSS rules override the inline attributes because
 * CSS author-level rules beat SVG presentation attributes in specificity.
 */
function buildThemeStyleBlock(): string {
  const light = PALETTES.light;
  const dark = PALETTES.dark;

  const lightRules = [
    `.${CLS.bg} { ${cssFillRule(light.background)} }`,
    `.${CLS.track} { ${cssFillRule(light.barTrack)} }`,
    `.${CLS.base} { ${cssFillRule(light.baseGrowth)} }`,
    `.${CLS.contrib} { ${cssFillRule(light.contributions)} }`,
    `.${CLS.target} { ${cssStrokeRule(light.targetLine)} }`,
    `.${CLS.fireHl} { ${cssFillRule(light.fireHighlight)} }`,
    `.${CLS.fire} { ${cssFillRule(light.fireAccent)} }`,
    `.${CLS.text} { ${cssFillRule(light.text)} }`,
    `.${CLS.muted} { ${cssFillRule(light.mutedText)} }`,
    `.${CLS.legend} { ${cssFillRule(light.legendText)} }`,
  ];

  const darkRules = [
    `.${CLS.bg} { ${cssFillRule(dark.background)} }`,
    `.${CLS.track} { ${cssFillRule(dark.barTrack)} }`,
    `.${CLS.base} { ${cssFillRule(dark.baseGrowth)} }`,
    `.${CLS.contrib} { ${cssFillRule(dark.contributions)} }`,
    `.${CLS.target} { ${cssStrokeRule(dark.targetLine)} }`,
    `.${CLS.fireHl} { ${cssFillRule(dark.fireHighlight)} }`,
    `.${CLS.fire} { ${cssFillRule(dark.fireAccent)} }`,
    `.${CLS.text} { ${cssFillRule(dark.text)} }`,
    `.${CLS.muted} { ${cssFillRule(dark.mutedText)} }`,
    `.${CLS.legend} { ${cssFillRule(dark.legendText)} }`,
  ];

  return [
    "<defs>",
    "  <style>",
    `    @media (prefers-color-scheme: light) {`,
    ...lightRules.map((r) => `      ${r}`),
    "    }",
    `    @media (prefers-color-scheme: dark) {`,
    ...darkRules.map((r) => `      ${r}`),
    "    }",
    "  </style>",
    "</defs>",
  ].join("\n");
}

// ──────────────────────────────────────────
// Main Builder
// ──────────────────────────────────────────

/**
 * Builds a stacked horizontal bar chart SVG for the FIRE projection.
 *
 * @param bars   - Pre-computed chart data, one entry per projection year
 * @param config - Target value, label, and theme
 * @returns Complete SVG document as a string, or empty string if no data
 *
 * @example
 * const svg = buildProjectionSVG(bars, {
 *   targetValue: 1_000_000,
 *   targetLabel: "£1.0M",
 *   theme: "dark",
 * });
 * const b64 = Buffer.from(svg).toString("base64");
 * const md = `![Projection](data:image/svg+xml;base64,${b64})`;
 */
export function buildProjectionSVG(bars: ChartBar[], config: ChartConfig): string {
  if (bars.length === 0) return "";

  const { targetValue, targetLabel, theme } = config;
  const palette = PALETTES[theme];

  // ── Dimensions ──

  const chartAreaHeight = bars.length * ROW_HEIGHT;
  const svgHeight = PADDING.top + chartAreaHeight + PADDING.bottom;

  // ── Scale ──
  // The bar area maps [0 … maxValue] → [0 … BAR_AREA_WIDTH]

  const maxValue = Math.max(...bars.map((b) => b.totalValue), targetValue);
  if (maxValue <= 0) return "";

  const scaleX = (value: number): number => (value / maxValue) * BAR_AREA_WIDTH;

  // Target line position
  const targetX = PADDING.left + scaleX(targetValue);

  // ── SVG elements ──

  const elements: string[] = [];

  // ── 0. Theme CSS (auto-detects dark/light via media queries) ──

  elements.push(buildThemeStyleBlock());

  // ── 1. Background ──
  // Explicit fill so the SVG is legible regardless of how Raycast
  // composites the <img> element (some renderers default to white).
  // The CSS `.c-bg` rule overrides this inline fill when media
  // queries are supported, ensuring the correct theme is applied.

  elements.push(
    `<rect class="${CLS.bg}" x="0" y="0" width="${SVG_WIDTH}" height="${svgHeight}" ` +
      `${fillAttr(palette.background)} rx="6" />`,
  );

  // ── 2. Bar track backgrounds ──

  for (let i = 0; i < bars.length; i++) {
    const y = PADDING.top + i * ROW_HEIGHT;
    elements.push(
      `<rect class="${CLS.track}" x="${PADDING.left}" y="${y}" width="${BAR_AREA_WIDTH}" height="${BAR_HEIGHT}" ` +
        `${fillAttr(palette.barTrack)} rx="2" />`,
    );
  }

  // ── 3. FIRE year highlight ──

  for (let i = 0; i < bars.length; i++) {
    if (!bars[i].isFireYear) continue;
    const y = PADDING.top + i * ROW_HEIGHT - 1;
    elements.push(
      `<rect class="${CLS.fireHl}" x="0" y="${y}" width="${SVG_WIDTH}" height="${BAR_HEIGHT + 2}" ` +
        `${fillAttr(palette.fireHighlight)} rx="3" />`,
    );
  }

  // ── 4. Base growth bars ──

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const w = scaleX(bar.baseGrowthValue);
    if (w <= 0) continue;

    const y = PADDING.top + i * ROW_HEIGHT;
    // Only round the right edge if there is no contribution segment following
    const rx = bar.contributionValue > 0 ? 0 : 2;
    elements.push(
      `<rect class="${CLS.base}" x="${PADDING.left}" y="${y}" width="${w}" height="${BAR_HEIGHT}" ` +
        `${fillAttr(palette.baseGrowth)} rx="${rx}" />`,
    );
  }

  // ── 5. Contribution bars (stacked after base growth) ──

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const contribW = scaleX(bar.contributionValue);
    if (contribW <= 0) continue;

    const baseW = scaleX(bar.baseGrowthValue);
    const x = PADDING.left + baseW;
    const y = PADDING.top + i * ROW_HEIGHT;

    elements.push(
      `<rect class="${CLS.contrib}" x="${x}" y="${y}" width="${contribW}" height="${BAR_HEIGHT}" ` +
        `${fillAttr(palette.contributions)} rx="2" />`,
    );
  }

  // ── 6. Target line (vertical dashed) ──

  const targetLineY1 = PADDING.top - 2;
  const targetLineY2 = PADDING.top + chartAreaHeight + 2;
  elements.push(
    `<line class="${CLS.target}" x1="${targetX}" y1="${targetLineY1}" x2="${targetX}" y2="${targetLineY2}" ` +
      `${strokeAttr(palette.targetLine)} stroke-width="1.5" stroke-dasharray="4,3" />`,
  );

  // ── 7. Year labels (left of bars) ──

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const y = PADDING.top + i * ROW_HEIGHT + BAR_HEIGHT / 2 + FONT_SIZE_LABEL * 0.38;
    const cls = bar.isFireYear ? CLS.fire : CLS.text;
    const color = bar.isFireYear ? palette.fireAccent : palette.text;
    const weight = bar.isFireYear ? "bold" : "normal";
    elements.push(
      `<text class="${cls}" x="${PADDING.left - 6}" y="${y}" ` +
        `${fillAttr(color)} font-size="${FONT_SIZE_LABEL}" font-weight="${weight}" ` +
        `font-family="${FONT_FAMILY}" text-anchor="end">${bar.year}</text>`,
    );
  }

  // ── 8. Value labels (right of bars) ──

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const y = PADDING.top + i * ROW_HEIGHT + BAR_HEIGHT / 2 + FONT_SIZE_LABEL * 0.38;
    const cls = bar.isFireYear ? CLS.fire : CLS.muted;
    const color = bar.isFireYear ? palette.fireAccent : palette.mutedText;
    const suffix = bar.isFireYear ? "  🎯" : "";
    elements.push(
      `<text class="${cls}" x="${SVG_WIDTH - PADDING.right + 6}" y="${y}" ` +
        `${fillAttr(color)} font-size="${FONT_SIZE_LABEL}" ` +
        `font-family="${FONT_FAMILY}" text-anchor="start">${bar.label}${suffix}</text>`,
    );
  }

  // ── 9. Legend ──

  const legendY = PADDING.top + chartAreaHeight + LEGEND_HEIGHT - 4;
  const legendElements = buildLegend(palette, targetLabel, legendY);
  elements.push(...legendElements);

  // ── Assemble SVG ──

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${svgHeight}" viewBox="0 0 ${SVG_WIDTH} ${svgHeight}">`,
    ...elements.map((el) => `  ${el}`),
    `</svg>`,
  ].join("\n");
}

// ──────────────────────────────────────────
// Legend
// ──────────────────────────────────────────

/**
 * Builds the legend row at the bottom of the chart.
 *
 * Layout:  ■ Portfolio Growth   ■ Contributions   │ £1.0M Target
 *
 * @param palette     - Active theme palette
 * @param targetLabel - Pre-formatted target value string
 * @param y           - Y-coordinate for the legend baseline
 * @returns Array of SVG element strings
 */
function buildLegend(palette: ThemePalette, targetLabel: string, y: number): string[] {
  const els: string[] = [];
  let x = PADDING.left;

  // ── Portfolio Growth swatch + label ──
  els.push(
    `<rect class="${CLS.base}" x="${x}" y="${y - LEGEND_SWATCH + 1}" width="${LEGEND_SWATCH}" height="${LEGEND_SWATCH}" ` +
      `${fillAttr(palette.baseGrowth)} rx="1" />`,
  );
  x += LEGEND_SWATCH + 5;
  els.push(
    `<text class="${CLS.legend}" x="${x}" y="${y}" ${fillAttr(palette.legendText)} font-size="${FONT_SIZE_LEGEND}" ` +
      `font-family="${FONT_FAMILY}">Portfolio Growth</text>`,
  );
  x += measureText("Portfolio Growth", FONT_SIZE_LEGEND) + LEGEND_ITEM_GAP;

  // ── Contributions swatch + label ──
  els.push(
    `<rect class="${CLS.contrib}" x="${x}" y="${y - LEGEND_SWATCH + 1}" width="${LEGEND_SWATCH}" height="${LEGEND_SWATCH}" ` +
      `${fillAttr(palette.contributions)} rx="1" />`,
  );
  x += LEGEND_SWATCH + 5;
  els.push(
    `<text class="${CLS.legend}" x="${x}" y="${y}" ${fillAttr(palette.legendText)} font-size="${FONT_SIZE_LEGEND}" ` +
      `font-family="${FONT_FAMILY}">Contributions</text>`,
  );
  x += measureText("Contributions", FONT_SIZE_LEGEND) + LEGEND_ITEM_GAP;

  // ── Target line indicator + label ──
  const lineY = y - LEGEND_SWATCH / 2 + 1;
  els.push(
    `<line class="${CLS.target}" x1="${x}" y1="${lineY}" x2="${x + LEGEND_SWATCH}" y2="${lineY}" ` +
      `${strokeAttr(palette.targetLine)} stroke-width="1.5" stroke-dasharray="3,2" />`,
  );
  x += LEGEND_SWATCH + 5;
  els.push(
    `<text class="${CLS.legend}" x="${x}" y="${y}" ${fillAttr(palette.legendText)} font-size="${FONT_SIZE_LEGEND}" ` +
      `font-family="${FONT_FAMILY}">${targetLabel} Target</text>`,
  );

  return els;
}

// ──────────────────────────────────────────
// Text Measurement (approximate)
// ──────────────────────────────────────────

/**
 * Approximate text width in pixels for legend layout.
 *
 * Uses a rough character-width multiplier. This doesn't need to be
 * pixel-perfect — it just needs to space legend items reasonably.
 *
 * @param text     - The string to measure
 * @param fontSize - Font size in px
 * @returns Approximate width in px
 */
function measureText(text: string, fontSize: number): number {
  // Average character width ≈ 0.6 × font size for proportional sans-serif
  return text.length * fontSize * 0.6;
}
