# BRAND

The NAP brand system reference.
Paired companion to [`nap-brand-system.html`](./nap-brand-system.html) — that file is the visual specimen; this file is the engineering reference.

---

**Product & company:** NAP (stylized `nap.` in the wordmark)
**Category:** Project-first accounting & ERP
**Tagline · primary:** TBD
**Tagline · secondary:** TBD
**Typography:** Inter (body & display) + JetBrains Mono (numerics)
**Domains:** `napsoft.io`, `napsoft.ai`, `napsoft.app`

---

## Table of contents

1. [Install](#install)
2. [Color tokens](#color-tokens)
3. [Typography tokens](#typography-tokens)
4. [Gold discipline — the three rules](#gold-discipline--the-three-rules)
5. [Icon vocabulary](#icon-vocabulary)
6. [Tagline usage](#tagline-usage)
7. [Voice principles](#voice-principles)
8. [Component specs](#component-specs)
9. [Do / Don't](#do--dont)
10. [Favicon & asset inventory](#favicon--asset-inventory)
11. [Reference](#reference)

---

## Install

### Fonts

Paste into `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

### Favicons

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
<meta name="theme-color" content="#2F3E52" />
```

The order matters. Modern browsers honor the SVG; older browsers that don't understand `image/svg+xml` walk down the list. The `favicon.ico` line is the fallback for legacy browsers (and a few corners of Outlook/Office that hard-code an `.ico` request).

### Base CSS

```css
:root {
  /* Brand — two navy tokens; identical in light, divergent in dark. See
     "Fill vs foreground" below for which to use where. */
  --navy: #2F3E52;        /* Fill: navy as background (white sits on top) */
  --navy-text: #2F3E52;   /* Foreground: navy as text/border/icon on a surface */
  --navy-hover: #243142;  /* Primary button hover fill */
  --gold: #F4B000;

  /* Light surfaces */
  --page: #FAFAF7;
  --card: #FFFFFF;
  --subtle: #F4F5F2;

  /* Light text */
  --text-primary: #1A2332;
  --text-secondary: #5A6475;
  --text-tertiary: #677082;

  /* Light borders */
  --border: #898F9D;
  --border-strong: #6B7280;

  /* Semantic */
  --success: #15803D;
  --warning: #E67E22;
  --warning-text: #B45309;
  --error: #B91C1C;
  --info: #2563EB;
  --info-text: #1D4ED8;

  /* Focus rings (light) — navy-tinted, never gold */
  --focus-ring: rgba(47, 62, 82, 0.12);
  --focus-ring-error: rgba(185, 28, 28, 0.12);

  /* Semantic tints (light — fixed pastels) */
  --success-tint-bg: #F0FDF4;
  --success-tint-border: #BBF7D0;
  --warning-tint-bg: #FFF7ED;
  --warning-tint-border: #FED7AA;
  --error-tint-bg: #FEF2F2;
  --error-tint-border: #FECACA;
  --info-tint-bg: #EFF6FF;
  --info-tint-border: #BFDBFE;
}

[data-theme="dark"] {
  /* Two-token navy: fill is darker so white text on it clears AA (5.51:1);
     foreground is lighter so navy-on-card clears AA (5.17:1). One value
     can't satisfy both roles — that's why there are two. */
  --navy: #4F6B8C;        /* Fill: primary CTA background, avatar fills */
  --navy-text: #698BB8;   /* Foreground: wordmark, navy text/border/icons */
  --navy-hover: #5E7DA3;  /* Primary button hover fill: lifted, not darkened,
                             so the change stays visible on the dark page */

  --page: #0B0F14;
  --card: #131923;
  --subtle: #1A212D;

  --text-primary: #E8ECF2;
  --text-secondary: #9AA4B4;
  --text-tertiary: #818B9C;

  --border: #636C7C;
  --border-strong: #8B95A5;

  --success: #22C55E;
  --warning: #F59E0B;
  --warning-text: #F59E0B; /* the light text variant is light-only */
  --error: #EF4444;
  --info: #60A5FA;
  --info-text: #60A5FA;    /* as --warning-text */

  /* Focus rings (dark) — tinted from --navy-text and --error at a higher
     alpha than light so the ring reads on the dark card */
  --focus-ring: rgba(105, 139, 184, 0.24);
  --focus-ring-error: rgba(239, 68, 68, 0.24);

  /* Semantic tints (dark — alpha-derived from each --main so they sit as
     a faint translucent wash on the dark card, not a pastel flash) */
  --success-tint-bg: rgba(34, 197, 94, 0.12);
  --success-tint-border: rgba(34, 197, 94, 0.32);
  --warning-tint-bg: rgba(245, 158, 11, 0.12);
  --warning-tint-border: rgba(245, 158, 11, 0.32);
  --error-tint-bg: rgba(239, 68, 68, 0.12);
  --error-tint-border: rgba(239, 68, 68, 0.32);
  --info-tint-bg: rgba(96, 165, 250, 0.12);
  --info-tint-border: rgba(96, 165, 250, 0.32);
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  background: var(--page);
  color: var(--text-primary);
  font-size: 15px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
```

---

## Color tokens

### Brand

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--navy` | `#2F3E52` | `#4F6B8C` | **Fill.** Navy as a *background* with white text/icons on top — primary CTA, avatar, any surface where navy sits *under* light content. Dark variant darkened so white-on-fill clears AA at 5.51:1. |
| `--navy-text` | `#2F3E52` | `#698BB8` | **Foreground.** Navy as text, border, or icon on a surface — wordmark, secondary/tertiary button text, sidebar active state, navy borders. Dark variant lifted so navy-on-card clears AA at 5.17:1. Identical to `--navy` in light mode. |
| `--navy-hover` | `#243142` | `#5E7DA3` | **Hover fill** for the primary button. Darkened in light mode; lifted in dark mode so the change stays visible against the dark page. |
| `--gold` | `#F4B000` | `#F4B000` | Three approved uses (see [Gold discipline](#gold-discipline--the-three-rules)). Same hex in both modes. |

**Brand identity constant:** `#2F3E52` is the canonical brand navy and never changes. It's the value that goes in the favicon, the `theme-color` meta tag, marketing PDFs, business cards, and merch. The on-screen `--navy` and `--navy-text` are *per-mode renderings* of that identity, tuned for AA contrast — they're not new brand colors.

### Surfaces · light mode

| Token | Hex | Usage |
|---|---|---|
| `--page` | `#FAFAF7` | Page background (warm off-white — never pure white) |
| `--card` | `#FFFFFF` | Elevated card surfaces |
| `--subtle` | `#F4F5F2` | Secondary surfaces, hover backgrounds |

### Surfaces · dark mode

| Token | Hex | Usage |
|---|---|---|
| `--page` | `#0B0F14` | Page background |
| `--card` | `#131923` | Elevated card surfaces |
| `--subtle` | `#1A212D` | Secondary surfaces |

### Text

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--text-primary` | `#1A2332` | `#E8ECF2` | Body, headlines, table data |
| `--text-secondary` | `#5A6475` | `#9AA4B4` | Supporting copy, metadata |
| `--text-tertiary` | `#677082` | `#818B9C` | Timestamps, disabled, fine print |

**Fill vs foreground (the two-navy rule):** `--navy` is the *fill* — something sits on it (almost always white). `--navy-text` is the *foreground* — it sits on something. In light mode the two tokens hold the same value (`#2F3E52`); in dark mode they diverge. Use `--navy` for primary button backgrounds, avatar fills, and any surface where navy is *underneath* lighter content. Use `--navy-text` for the wordmark, secondary/tertiary button text, sidebar active state, navy borders, and navy icons — anywhere navy *is* the visible content on top of a card or page.

**Why two tokens in dark mode:** A single navy can't satisfy both roles. The fill must be dark enough that white text on it clears 4.5:1; the foreground must be light enough that it on a dark card clears 4.5:1. One color can't be both. The lifted dark.navy from earlier (`#5D7CA2`) was a compromise that ended up failing AA in both directions (white-on-fill at 4.32:1, navy-on-card at ~3:1). Splitting into `--navy` (`#4F6B8C`) and `--navy-text` (`#698BB8`) lets each token be optimal for its job.

**Don't render the canonical `#2F3E52` directly on the dark page** — it's ~1.4:1 against `#0B0F14`, completely invisible. Always use the per-mode token.

### Borders

| Token | Light | Dark |
|---|---|---|
| `--border` | `#898F9D` | `#636C7C` |
| `--border-strong` | `#6B7280` | `#8B95A5` |

Both tokens reach ≥3:1 against page and card surfaces (WCAG 1.4.11 non-text contrast) so dividers, input outlines, and dialog edges remain visible. Strong is roughly 1.5× the contrast of subtle in both modes.

### Semantic

| Token | Light | Dark | Text variant |
|---|---|---|---|
| `--success` | `#15803D` | `#22C55E` | Use the same hex for text |
| `--warning` | `#E67E22` | `#F59E0B` | Use `#B45309` for text on light (contrast); dark text uses the main `#F59E0B` (`--warning-text`) |
| `--error` | `#B91C1C` | `#EF4444` | Use the same hex for text |
| `--info` | `#2563EB` | `#60A5FA` | Use `#1D4ED8` for text on light; dark text uses the main `#60A5FA` (`--info-text`) |

**Semantic tinted backgrounds** (for alerts/badges):

| Role | Light bg | Light border | Dark bg | Dark border |
|---|---|---|---|---|
| Success | `#F0FDF4` | `#BBF7D0` | `rgba(34, 197, 94, 0.12)` | `rgba(34, 197, 94, 0.32)` |
| Warning | `#FFF7ED` | `#FED7AA` | `rgba(245, 158, 11, 0.12)` | `rgba(245, 158, 11, 0.32)` |
| Error | `#FEF2F2` | `#FECACA` | `rgba(239, 68, 68, 0.12)` | `rgba(239, 68, 68, 0.32)` |
| Info | `#EFF6FF` | `#BFDBFE` | `rgba(96, 165, 250, 0.12)` | `rgba(96, 165, 250, 0.32)` |

**Why two patterns:** Light mode uses fixed pastel hexes that read as gentle washes on white/cream surfaces. In dark mode, those same pastels render as washed-out near-white flashes against `#131923` — distracting and out of palette. Dark mode derives its tints from each semantic `--main` color via `alpha(main, 0.12)` for backgrounds and `alpha(main, 0.32)` for borders, producing a faint translucent wash in the matching hue. Consume via the `--*-tint-bg` / `--*-tint-border` CSS variables defined in [Install](#install) — they swap automatically when `[data-theme="dark"]` is applied.

---

## Typography tokens

### Families

```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
--font-mono: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
```

### Product scale

Use inside the app. Optimized for scanning dense data.

| Role | Size | Weight | Letter-spacing | Line-height |
|---|---|---|---|---|
| Body | 15px | 400 | normal | 1.55 |
| Body small | 13px | 400 | normal | 1.55 |
| Label | 12px | 500 | 0.01em | 1.4 |
| Helper / meta | 12px | 400 | normal | 1.5 |
| Button | 14px | 500 | -0.005em | 1 |
| Table row | 13px | 400 | normal | 1.4 |
| Table header | 11px | 500 | 0.08em (uppercase) | 1.4 |
| Section title | 28px | 600 | -0.02em | 1.2 |

### Marketing scale

Use on marketing pages (home, pricing, about, features). Larger and looser than product scale.

| Role | Size | Weight | Letter-spacing | Line-height |
|---|---|---|---|---|
| Display 1 (hero) | 64px | 600 | -0.03em | 1.02 |
| Display 2 | 48px | 600 | -0.025em | 1.05 |
| Display 3 | 36px | 600 | -0.02em | 1.15 |
| Heading 1 | 28px | 600 | -0.015em | 1.25 |
| Heading 2 | 22px | 600 | -0.01em | 1.3 |
| Heading 3 | 18px | 600 | -0.005em | 1.35 |
| Lede | 20px | 400 | normal | 1.55 |
| Body large | 17px | 400 | normal | 1.6 |
| Body | 15px | 400 | normal | 1.55 |
| Eyebrow | 11px | 600 | 0.14em (uppercase) | 1 |
| Mono data | 13px | 500 | normal | 1.4 |

**Don't mix scales.** Marketing type on a product screen reads cramped; product type on a marketing page reads amateur.

---

## Gold discipline — the three rules

Gold (`#F4B000`) appears in exactly these three places. Nowhere else.

1. **The logo dot** — the square period after `nap.`
2. **Active nav indicator** — one element per screen (left bar on side nav OR underline on tabs)
3. **Final-total rule in reports** — 2px bar above the totals row

**Self-check:** If a single screen shows more than 2 gold elements, something is violating the system.

The primary button carries no gold. A product screen shows buttons far too often for a gold stripe on each to stay rare, so the button is navy alone (see [Primary button](#primary-button)).

**Never put gold on:** chips, badges, focus rings, icons, checkboxes, radios, toggles, form borders, sort indicators, selected rows, dropdown items, or decorative accents.

---

## Icon vocabulary

Each semantic state uses one consistent glyph across alerts, toasts, and field errors. Badges use distinct shapes (triangle, circle, diamond) because tiny circular glyphs don't read at badge scale.

| State | Alert glyph | Badge shape | Meaning |
|---|---|---|---|
| Success | `✓` | `✓` | Completed, confirmed, approved |
| Warning | `!` | `▲` | Attention required, review before proceeding |
| Error | `×` | `●` | Blocked, rejected, cannot proceed |
| Info | `i` | `i` | Informational, in progress |
| Neutral / draft | — | `◇` | Not yet acted on, saved but unsubmitted |

**Accessibility rule:** Every status indicator pairs shape with color. Color alone is never sufficient — this is WCAG 1.4.1 and it's also what keeps the UI usable for the ~8% of men with color vision deficiency.

---

## Tagline usage

Two taglines, two jobs. Never use both on the same surface.

| Surface | Tagline | Why |
|---|---|---|
| Landing page hero | TBD · primary | Sales surface, first-touch conversion |
| Pricing page hero | TBD · primary | Keep the selling line at decision moment |
| Demo / deck cover | TBD · primary | One-line pitch for first slide |
| Website footer | TBD · secondary | Brand persistence after engagement |
| About page hero | TBD · secondary | Brand moment for interested visitors |
| Email signature | TBD · secondary | Personality for existing contacts |
| Conference swag | TBD · secondary | Memorable, quotable, retention-earning |
| Social bio | "Project-first accounting. TBD · primary." | Category + tagline |
| Marketing email subject lines | Varies — see voice guide | Avoid using either verbatim |

**The secondary line is italic in production.** Italic reads as almost-conversational; upright would feel too declarative.

---

## Voice principles

1. **Confident, never clever.** The name already does the wink. The copy doesn't.
2. **Specific, never generic.** "Project-first accounting" beats "modern ERP."
3. **Anti-bloat, never anti-competitor.** Don't name rivals (SAP, NetSuite, QuickBooks). It makes us look small.
4. **Short over long.** Three words over ten when possible.
5. **Nouns over adjectives.** "The ledger that thinks in projects" beats "revolutionary AI-powered platform."
6. **Never apologize for the name.** If asked, tell the origin story (Not Another Program). Don't defend.

### Vocabulary

**Use:**
project-first, real-time, profitability, cashflow, truth, ledger, post, close, reconcile, approve, track, module, tenant, workspace, workflow

**Avoid:**
synergy, leverage, solution, game-changing, revolutionary, next-gen, paradigm, unlock, empower, disrupt, seamless, robust, cutting-edge

---

## Component specs

Copy-paste starting points. Markup is plain HTML with BEM-ish classes — port to your framework of choice.

### Primary button

```html
<button class="btn-primary">Post journal entry</button>
```

```css
.btn-primary {
  display: inline-flex;
  align-items: center;
  padding: 12px 22px;
  background: var(--navy);
  color: #FFFFFF;
  border: none;
  border-radius: 4px;
  font: 500 14px/1 'Inter', sans-serif;
  letter-spacing: -0.005em;
  cursor: pointer;
  transition: background 160ms ease;
}
.btn-primary:hover {
  background: var(--navy-hover);
}
.btn-primary:disabled {
  background: var(--border-strong);
  color: var(--text-tertiary);
  cursor: not-allowed;
}
```

**Rule: one primary button per screen.** If two things look primary, neither is.

### Secondary button

```html
<button class="btn-secondary">Save as draft</button>
```

```css
.btn-secondary {
  padding: 12px 22px;
  background: transparent;
  color: var(--navy-text);
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  font: 500 14px/1 'Inter', sans-serif;
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease;
}
.btn-secondary:hover {
  background: var(--subtle);
  border-color: var(--text-tertiary);
}
```

### Tertiary (ghost) button

```html
<button class="btn-tertiary">Cancel</button>
<button class="btn-tertiary btn-tertiary--danger">Discard</button>
```

```css
.btn-tertiary {
  padding: 12px 14px;
  background: transparent;
  color: var(--navy-text);
  border: none;
  border-radius: 4px;
  font: 500 14px/1 'Inter', sans-serif;
  cursor: pointer;
}
.btn-tertiary:hover { background: var(--subtle); }
.btn-tertiary--danger { color: var(--error); }
.btn-tertiary--danger:hover { background: var(--error-tint-bg); }
```

### Destructive actions

Do **not** use red fill for destructive buttons. Keep the primary navy with a clear label:

```html
<!-- Correct -->
<button class="btn-primary">Delete invoice</button>
<button class="btn-secondary">Cancel</button>
```

Red is reserved for *status* (something is broken), not *action* (the user is taking a step). Conflating them trains users to associate red with both bad states and normal actions, and the signal weakens.

### Text input

```html
<div class="field">
  <label class="field-label">Invoice number<span class="field-required">*</span></label>
  <input class="input" type="text" placeholder="Enter invoice number" />
  <div class="field-helper">Helper text</div>
</div>
```

```css
.field { display: flex; flex-direction: column; gap: 6px; }
.field-label {
  font: 500 12px/1.4 'Inter', sans-serif;
  color: var(--text-secondary);
  letter-spacing: 0.01em;
}
.field-required {
  color: var(--text-tertiary);
  margin-left: 3px;
  font-weight: 400;
}
.field-helper {
  font: 400 12px/1.5 'Inter', sans-serif;
  color: var(--text-tertiary);
}

.input {
  width: 100%;
  padding: 9px 12px;
  background: var(--card);
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  font: 400 14px/1.4 'Inter', sans-serif;
  color: var(--text-primary);
  transition: border-color 140ms ease, box-shadow 140ms ease;
}
.input::placeholder { color: var(--text-tertiary); }
.input:hover { border-color: var(--text-tertiary); }
.input:focus {
  outline: none;
  border-color: var(--navy-text);
  box-shadow: 0 0 0 3px var(--focus-ring);
}
.input:disabled {
  background: var(--subtle);
  color: var(--text-tertiary);
  border-color: var(--border);
  cursor: not-allowed;
}
.input--error { border-color: var(--error); }
.input--error:focus {
  border-color: var(--error);
  box-shadow: 0 0 0 3px var(--focus-ring-error);
}
```

**Rules:**
- Required asterisk is neutral gray, not colored
- Focus rings are navy-tinted, never gold (too many inputs per screen). `--focus-ring` and `--focus-ring-error` carry the per-mode alpha; dark mode uses a higher alpha so the ring reads on the dark card
- Labels always above the input, never to the left

### Currency input

Accounting-specific. Numeric fields need monospace digits, right-alignment, and parentheses for negatives.

```html
<div class="input-currency">
  <span class="input-currency-prefix">$</span>
  <input class="input" type="text" value="12,480.50" />
</div>
```

```css
.input-currency {
  display: flex;
  align-items: stretch;
  background: var(--card);
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  transition: border-color 140ms ease, box-shadow 140ms ease;
}
.input-currency:focus-within {
  border-color: var(--navy-text);
  box-shadow: 0 0 0 3px rgba(47, 62, 82, 0.12);
}
.input-currency-prefix {
  padding: 0 10px 0 12px;
  display: flex;
  align-items: center;
  color: var(--text-tertiary);
  border-right: 1px solid var(--border);
}
.input-currency .input {
  border: none;
  border-radius: 0;
  font-family: 'JetBrains Mono', monospace;
  text-align: right;
}
.input-currency--negative .input { color: var(--error); }
```

**Formatting rules:**
- Negative values: `(1,245.00)` — parentheses, not minus sign
- Apply thousands separators on blur, not while typing
- Arrow keys increment by 1; shift+arrow by 100; alt+arrow by 1000

### Status badge

```html
<span class="badge badge--warning">
  <span class="badge-icon">▲</span>Due in 3 days
</span>
```

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px 3px 7px;
  font: 500 11px/1.4 'Inter', sans-serif;
  border-radius: 3px;
  letter-spacing: 0.01em;
  border: 1px solid;
}
.badge-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px; height: 12px;
  font: 700 10px/1 'Inter', sans-serif;
}

.badge--success { background: var(--success-tint-bg); border-color: var(--success-tint-border); color: var(--success); }
.badge--warning { background: var(--warning-tint-bg); border-color: var(--warning-tint-border); color: var(--warning-text); }
.badge--error   { background: var(--error-tint-bg);   border-color: var(--error-tint-border);   color: var(--error); }
.badge--info    { background: var(--info-tint-bg);    border-color: var(--info-tint-border);    color: var(--info); }
.badge--neutral { background: var(--subtle); border-color: var(--border); color: var(--text-secondary); }
```

### Alert banner

```html
<div class="alert alert--error">
  <div class="alert-icon">×</div>
  <div class="alert-body">
    <strong>Journal entry rejected.</strong> Debits and credits do not balance.
  </div>
</div>
```

```css
.alert {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 4px;
  border-left: 2px solid;
  font: 400 13px/1.5 'Inter', sans-serif;
  color: var(--text-primary);
}
.alert-icon {
  flex-shrink: 0;
  width: 18px; height: 18px;
  font: 700 12px/1 'Inter', sans-serif;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #FFFFFF;
  margin-top: 1px;
}

.alert--success { background: var(--success-tint-bg); border-left-color: var(--success); }
.alert--success .alert-icon { background: var(--success); }
.alert--warning { background: var(--warning-tint-bg); border-left-color: var(--warning); }
.alert--warning .alert-icon { background: var(--warning); }
.alert--error   { background: var(--error-tint-bg);   border-left-color: var(--error); }
.alert--error   .alert-icon { background: var(--error); }
.alert--info    { background: var(--info-tint-bg);    border-left-color: var(--info); }
.alert--info    .alert-icon { background: var(--info); }
```

### Nav item (active indicator)

```html
<nav class="nav-demo">
  <div class="nav-item">Dashboard</div>
  <div class="nav-item active">Projects</div>
  <div class="nav-item">Reports</div>
</nav>
```

```css
.nav-item {
  position: relative;
  padding: 10px 20px 10px 24px;
  font: 400 13px/1.4 'Inter', sans-serif;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 140ms ease;
}
.nav-item:hover { color: var(--text-primary); }
.nav-item.active {
  color: var(--text-primary);
  font-weight: 500;
}
.nav-item.active::before {
  content: "";
  position: absolute;
  left: 0; top: 6px; bottom: 6px;
  width: 2px;
  background: var(--gold);
}
```

### Table

Keep it boring. No zebra stripes. No vertical gridlines. Gold only on the totals row.

```css
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.table thead {
  background: var(--page);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.table th {
  padding: 10px 12px;
  height: 36px;
  font: 500 11px/1 'Inter', sans-serif;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  text-align: left;
  white-space: nowrap;
}
.table th.th-num { text-align: right; }
.table td {
  padding: 0 12px;
  height: 44px;
  border-bottom: 1px solid var(--border);
  color: var(--text-primary);
  vertical-align: middle;
}
.table tbody tr { transition: background 140ms ease; }
.table tbody tr:hover { background: var(--page); }
.table tbody tr.is-selected { background: var(--subtle); }
.td-num {
  text-align: right;
  font-family: 'JetBrains Mono', monospace;
}
.td-date {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}
.td-negative { color: var(--error); }

/* Totals row with gold rule */
.table tfoot td {
  border-top: 1px solid var(--border);
  border-bottom: none;
  background: var(--page);
  font-weight: 600;
  height: 44px;
  position: relative;
}
.table tfoot tr:first-child td.td-gold-rule::before {
  content: "";
  position: absolute;
  left: 12px; right: 12px; top: -1px;
  height: 2px;
  background: var(--gold);
}
```

---

## Do / Don't

### Do

- Let navy carry 70–80% of visual surface
- Use gold only in the three approved places
- Use JetBrains Mono for all numeric data
- Use warm off-white (`#FAFAF7`) for page, pure white for cards
- Keep primary buttons rare — one per screen
- Use Inter Medium for the wordmark (never Bold)
- Stack form labels above inputs, never to the left
- Use parentheses for negative values: `(1,245.00)` not `-1,245.00`
- Mark required fields with a neutral-gray asterisk
- Pair every status color with a shape (icon, glyph, or badge shape)
- Right-align numeric table columns; monospace their content
- Use skeleton rows for loading tables, never spinners
- Lead with the primary tagline on sales surfaces
- Use the secondary tagline in brand moments (footer, About, swag)
- Match type scale to context — marketing is bigger, product is denser

### Don't

- Add gold to chips, badges, focus rings, icons, or form borders
- Use gold on input focus states (too many inputs per screen)
- Use gradients in the wordmark
- Return to script fonts (no Allura)
- Reintroduce the cloud glyph
- Use pure white as the page background
- Flood CTA buttons with gold fill
- Use bold weight for the wordmark
- Nest boxed sections within boxed sections in forms
- Use red fill for destructive buttons
- Zebra-stripe table rows or add vertical gridlines
- Mix both taglines on the same surface
- Apologize for the name in copy — lean in, don't defend
- Use product-scale typography on marketing pages
- Use corporate buzzwords (`synergy`, `seamless`, `robust`, `disrupt`, etc.)

---

## Favicon & asset inventory

All in `/favicons/`:

| File | Size | Used for |
|---|---|---|
| `favicon.svg` | Vector | Primary favicon (modern browsers) |
| `favicon.ico` | 16/32/48 multi-res | Legacy browser fallback when SVG isn't recognized |
| `favicon-16.png` | 16×16 | Legacy browsers, tight UI |
| `favicon-32.png` | 32×32 | Standard tab favicon |
| `favicon-48.png` | 48×48 | Windows site tiles |
| `favicon-64.png` | 64×64 | Retina tab favicon |
| `favicon-128.png` | 128×128 | Desktop shortcuts |
| `favicon-512.png` | 512×512 | High-res source |
| `apple-touch-icon.png` | 180×180 | iOS home screen |
| `android-chrome-192.png` | 192×192 | Android home screen |
| `android-chrome-512.png` | 512×512 | PWA splash / install |

### site.webmanifest

```json
{
  "name": "nap",
  "short_name": "nap",
  "icons": [
    {
      "src": "/android-chrome-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/android-chrome-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ],
  "theme_color": "#2F3E52",
  "background_color": "#FAFAF7",
  "display": "standalone"
}
```

### Logo wordmark

The wordmark is implemented as HTML, not an image, so it renders crisp at any size and respects the CSS variables. Use:

```html
<span class="wordmark">nap<span class="wordmark-dot"></span></span>
```

```css
.wordmark {
  font-family: 'Inter', sans-serif;
  font-weight: 500;
  color: var(--navy-text);
  display: inline-flex;
  align-items: baseline;
  line-height: 1;
  letter-spacing: -0.02em;
}
.wordmark-dot {
  display: inline-block;
  background: var(--gold);
  align-self: flex-end;
  width: 0.19em;
  height: 0.19em;
  margin-left: 0.06em;
  margin-bottom: 0.06em;
}
```

Set the `font-size` on the outer `.wordmark` and the dot scales with it automatically.

---

## Reference

- **Visual specimen:** [`nap-brand-system.html`](./nap-brand-system.html) — all decisions with reasoning, all components rendered in context, colorblind verification, accessibility notes.
- **Favicon preview:** [`nap-favicon-preview.html`](./nap-favicon-preview.html) — every size in browser tab, bookmark, iOS home screen mockups.
- **Icon vocabulary (detailed):** Section 02 of the specimen
- **Gold discipline (with examples):** Section 03 of the specimen
- **Component gallery (with hover states):** Sections 04–06 of the specimen
- **Tagline & voice (with sample copy):** Section 07 of the specimen
- **Marketing typography (with hero mockup):** Section 08 of the specimen

---

*Brand system v1 · Updated with WCAG AA tokens & two-token navy split · 2026-09-02: three gold rules (the primary-button stripe is retired), `--navy-hover`, dark text variants, and per-mode focus-ring tokens adopted from the web client · © NAP*
