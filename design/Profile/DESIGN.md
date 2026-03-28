# Design System Strategy: The Synthetic Luminal Aesthetic

## 1. Overview & Creative North Star: "The Neon Architect"
This design system is built for precision, high-velocity data synthesis, and technical authority. Our Creative North Star is **"The Neon Architect"**—a visual language that balances the cold, structural rigidity of a mainframe terminal with the fluid, premium feel of high-end editorial software. 

We break the "template" look by eschewing standard borders in favor of **Tonal Layering**. The UI should feel like a series of illuminated glass panels floating in a deep vacuum. We use intentional asymmetry—such as wide tracking on labels and condensed monospaced data—to create a sense of bespoke engineering rather than generic utility.

## 2. Colors & Surface Logic
The palette is rooted in a deep obsidian foundation (`#0a0e14`) punctuated by electric, "Neon" accents.

### The Surface Hierarchy
Depth is conveyed through background shifts, not shadows.
*   **Base:** `surface` (#0a0e14) — The infinite void.
*   **Sub-Sectioning:** `surface_container_low` (#0f141a) — Used for large background regions.
*   **Nesting:** `surface_container` (#151a21) — Used for primary content containers (Cards).
*   **Interaction:** `surface_bright` (#262c36) — Used for hover states and active indicators.

### Strategic Rules
*   **The "No-Line" Rule:** Prohibit 1px solid borders for layout sectioning. Separation must be achieved by placing a `surface_container_low` card on a `surface` background.
*   **The Glass & Gradient Rule:** For primary CTAs and floating modals, use a backdrop-blur (12px–20px) with `surface_container_high` at 70% opacity. Apply a subtle linear gradient from `primary` (#85adff) to `primary_container` (#6e9fff) to give action elements a "pulsing" energy.
*   **Signature Textures:** Use `outline_variant` at 15% opacity to create "micro-textures" in headers, mimicking the look of etched glass.

## 3. Typography: The Technical Editorial
We utilize two distinct typefaces to separate "Interface Instruction" from "Data Reality."

*   **UI & Editorial (Space Grotesk):** Used for Headlines and Display. Its wide apertures feel modern and architectural.
    *   *Headline-LG:* 2rem. High-contrast, bold, leading the eye to key actions.
*   **Navigation & Body (Inter):** Used for titles and descriptions. It provides maximum legibility at smaller scales.
    *   *Title-MD:* 1.125rem. Balanced and authoritative.
*   **Data & Metadata (Monospace/JetBrains Mono):** Used for all synthetic data, table names, and code-heavy labels.
    *   *Label-MD:* 0.75rem. Monospaced to imply technical precision.

## 4. Elevation & Depth
In a dark-themed technical environment, traditional drop shadows are "visual noise." We utilize **Tonal Layering** and **Ambient Light**.

*   **The Layering Principle:** A `surface_container_highest` element should only ever sit on a `surface_container` or lower. This "stepping" creates a natural optical lift.
*   **Ambient Shadows:** If a card must float (e.g., a context menu), use a shadow color tinted with `primary_dim` at 5% opacity, with a 32px blur. It should look like a soft blue glow reflecting off the surface below.
*   **The "Ghost Border" Fallback:** For card containment, use `outline_variant` (#44484f) at **20% opacity**. It must feel like a suggestion of a boundary, not a hard line.

## 5. Components

### Action Buttons
*   **Primary:** Background: `primary` (#85adff); Text: `on_primary_fixed` (#000000). Use `md` (0.375rem) roundedness. High contrast is mandatory; the button should look like it’s glowing.
*   **Secondary:** Background: `secondary_container`; Text: `on_secondary_container`. Low-key but reachable.

### Data Chips
*   **Style:** `surface_variant` background with `label-sm` (Monospace).
*   **Usage:** For table names (e.g., `customer_addresses`) as seen in the reference image. No border; strictly tonal.

### Synthetic Data Cards
*   **Structure:** No divider lines. Use `spacing-6` (1.5rem) to separate the title from the metadata footer.
*   **Visuals:** Use `surface_container` with a `Ghost Border`.

### Input Fields
*   **State:** Default state is a `surface_container_lowest` fill with a subtle `outline`. On focus, the border transitions to `tertiary` (#99f7ff) with a 2px outer glow (Soft Neon).

### Iconography
*   **Technical Set:** Use thin-stroke (1.5pt) icons. Apply `primary` color to icons that represent "Action" and `on_surface_variant` for decorative/informational icons.

## 6. Do's and Don'ts

### Do
*   **DO** use Monospace for any element that represents "The Data" (tables, rows, dates).
*   **DO** use wide spacing (`spacing-12` or `spacing-16`) for hero sections to let the deep navy background "breathe."
*   **DO** use `tertiary` (#99f7ff) sparingly as a "high-alert" or "success" accent to draw attention to completed synthesis.

### Don't
*   **DON'T** use 100% white (#FFFFFF). Always use `on_background` (#f1f3fc) to prevent eye strain in dark mode.
*   **DON'T** use 1px solid borders to separate list items. Use a 1px `surface_container_highest` background shift or simply whitespace.
*   **DON'T** use standard "drop shadows" (Black/Grey). Only use tinted, low-opacity ambient glows.