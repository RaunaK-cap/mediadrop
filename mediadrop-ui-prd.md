# MediaDrop — UI/UX PRD (v1)

**One page. One job.** Paste a URL → see what's available → download it. No accounts, no ads, no tracking. This is the complete design and interaction spec for the app's single page — written so a builder (human or AI) can implement it without making any further design decisions.

Backend context (already specced): Next.js monolith, yt-dlp via spawn, FFmpeg merge, SSE progress, stateless, no database. This PRD covers the front end only.

---

## 1. Reference analysis

**Signal Sales (primary layout reference — "the blue one").**
Composition: a tinted color field as the hero background; headline + subtext sit directly ON the field; the product UI floats over the field as a large rounded card. The product screenshot *is* the hero image.
- KEEP: this exact composition. The tinted field, the floating card overlapping the field's edge, the black primary button on a colored field.
- CHANGE: our floating card is the **live, working downloader**, not a screenshot — usable without scrolling.
- REJECT: the saturated blue gradient. It is the visual signature of every AI-generated landing page. Our field is a flat warm paper tone.

**Call panel (interaction reference).**
The progress vocabulary: a circular control with a glyph, an elapsed/total readout ("0:00 / 0:06"), a thin horizontal progress track. This becomes our download state verbatim — same layout logic, our units (MB downloaded / total, speed, ETA).
- KEEP: circular progress control + numeric readout pairing.
- REJECT: translucency/glass. Our card is flat white on the tinted field.

**Trueme (structure reference).**
Single-page narrative order (nav → hero → product preview → feature blocks → footer) with restrained neutral surfaces.
- KEEP: page order and quiet gray-on-white feature blocks.
- COMPRESS: one small feature strip instead of long feature sections — our page's job is the tool, not the story.

---

## 2. Design principles

1. **The hero IS the app.** Input is visible and usable in the first viewport, at every screen size. Zero scroll to start.
2. **Monochrome, flat, hairline.** No gradients, no glassmorphism, no glows, no blue-purple, no blob radii.
3. **Ink black is the action color** (both references use black CTAs — keep that). One green accent, reserved strictly for progress / success / active states.
4. **Inter, small sizes, tight tracking.** Dense and precise, like a developer tool — not big airy marketing type.
5. **Motion is feedback, never decoration.** If something animates, a state changed. No ambient/looping animation except the skeleton shimmer.

---

## 3. Design system

### 3.1 Palette

**Light (default)**

| Token | Value | Use |
|---|---|---|
| `--bg` | `#FAFAF9` | Page background |
| `--tint` | `#F2F0EA` | Hero field (flat, warm paper) |
| `--card` | `#FFFFFF` | Tool card, inputs |
| `--border` | `#E7E5E0` | Hairline borders (1px everywhere) |
| `--ink` | `#1B1B19` | Primary text, primary buttons |
| `--ink-2` | `#6E6E68` | Secondary text |
| `--ink-3` | `#9A9A93` | Meta only (non-essential text) |
| `--accent` | `#177B4B` | Progress fill, success, active dot, focus ring |
| `--danger` | `#B42318` | Error text |

**Dark**

| Token | Value |
|---|---|
| `--bg` | `#0C0C0B` |
| `--tint` | `#101010` |
| `--card` | `#151514` |
| `--border` | `#272723` |
| `--ink` | `#ECECE8` |
| `--ink-2` | `#909089` |
| `--ink-3` | `#62625D` |
| `--accent` | `#3ECF8E` |
| `--danger` | `#F97066` |

**Rules**
- Zero gradients in shipped CSS. One exception: the skeleton shimmer sweep at ≤8% opacity (functional, not decorative).
- Accent never fills large areas. It appears only as: progress bar fill, selected-format dot, success checkmark, focus ring.
- Optional: 2–3% opacity SVG noise/grain on the hero tint field for an "authored paper" feel. Off by default is fine.
- Primary button in dark mode: white bg, ink text (inverted).

### 3.2 Typography — Inter (Google, via `next/font`)

Small, precise scale. All numerals that tick (sizes, progress) use `font-variant-numeric: tabular-nums`.

| Role | Size / weight / tracking | Notes |
|---|---|---|
| Kicker | 11px / 600 / +0.08em | Uppercase, `--ink-3` |
| H1 | 30px mobile · 44px desktop / 650 / −0.03em | line-height 1.1 |
| Sub | 14px / 400 / −0.005em | `--ink-2`, max ~48ch |
| Card title | 14px / 550 / −0.01em | 2-line clamp |
| Body / UI | 13–14px / 450 | |
| Meta (uploader, dates) | 12px / 450 | `--ink-3` |
| Format rows | 13px / 450 | tabular nums for sizes |
| Buttons | 13px / 550 | |
| Footer | 11px / 400 | `--ink-3` |

### 3.3 Surfaces & layout

- Page column: **640px max, centered**. Mobile: full width minus 20px page padding.
- Hero tint field: full-bleed, contains nav + kicker + H1 + sub. Ends ~40% down the first viewport.
- Tool card: floats **overlapping the tint field's bottom edge by 24–48px** — this overlap is the signature compositional move from the reference.
- Card: radius 12px, 1px `--border`, shadow `0 1px 2px rgba(0,0,0,.05), 0 12px 32px rgba(0,0,0,.07)`. Dark mode: same structure, shadow near-invisible.
- Inner elements (inputs, format rows, thumbnail): radius 8px.
- Spacing: 4px base grid. Card padding 16px mobile / 20px desktop.
- Primary button: `--ink` bg, `--bg` text, height 38px (44px tap target on mobile). Secondary: transparent, 1px border.

### 3.4 Iconography

Lucide, 14–16px, 1.5 stroke. Functional only: paste, clipboard-check, download, x, check, sun/moon, image, link. No decorative icons in the feature strip (text only).

---

## 4. Page anatomy (top → bottom)

### 4.0 Nav — on tint field
Left: wordmark **`mediadrop`** with a ↓ glyph — the logo is a down-arrow; the whole product in one character. 14px / 550.
Right: theme toggle (sun/moon) + quiet "GitHub" text link. Height 56px.
**Nothing else.** No other links exist — there is nowhere to navigate to.

### 4.1 Hero — on tint field
- Kicker: `1000+ SITES · VIDEO & AUDIO`
- H1: `Paste. Choose. Download.`
- Sub: `Grab video or audio from YouTube, Instagram, X and 1000+ other sites. No ads, no redirects, no waiting rooms.`
- **No CTA buttons.** The card below is the CTA. Button-count discipline: the page has exactly one primary action.

### 4.2 The tool card
Floats over the tint→bg boundary. Full behavior in §5. This is the product.

### 4.3 Feature strip — below card, plain bg
Four minimal text blocks, no icons. 2×2 grid mobile, 4 columns desktop. Scroll-revealed, staggered.

| Heading | Body |
|---|---|
| No ads, ever | The page has nothing to sell you. |
| Real progress | MB, speed and ETA — not a spinner. |
| Audio too | Any video, one tap to MP3. |
| Nothing stored | No accounts. Files are streamed and forgotten. |

Heading 13px/600 ink; body 12px `--ink-3`.

### 4.4 Platform line
Centered meta text: `Works with YouTube · Instagram · X · TikTok · Reddit · Vimeo · and 1000+ more`. Static (no marquee).

### 4.5 Footer — one line
`mediadrop — a personal-use tool. Please respect creators and platform terms. Nothing is stored.` 11px, `--ink-3`.

---

## 5. The tool card — state machine

States: `idle → analyzing → result → downloading → done`, with `error` reachable from `analyzing` and `downloading`. Implement as a single reducer.

**Persistent across all states:** the URL input row stays visible at the top of the card — like a browser address bar. The pasted URL is the user's context; never hide it.

### 5.1 idle
- Input (placeholder `Paste a video or post URL`) + **Paste** button using the async Clipboard API. Where the browser blocks it, show the button but fall back to focusing the input on tap. `inputmode="url"`, `spellcheck="false"`.
- Helper meta below input: `Works with YouTube, Instagram, X and 1000+ more sites`.
- Enter submits. Ctrl/Cmd+V anywhere on the page pastes into the input. Autofocus on desktop only — never auto-open the mobile keyboard.

### 5.2 analyzing
- Input locked; URL shown middle-truncated.
- Submit control → 14px ink spinner.
- Below input: skeleton card (16:9 thumbnail block + two text lines), shimmer 1.6s.
- Status line: `Talking to YouTube…` (platform derived from URL).
- 30s timeout → error state.

### 5.3 result
- **Media header:** thumbnail (16:9, radius 8, max-height 180px, duration badge `12:34` bottom-right in 11px on an ink scrim), title (2-line clamp), meta line `@uploader · 3 days ago · YouTube`.
- **Multi-media (carousels):** thumbnail strip with item selector + `1/5` counter above the format list; tapping switches the item. The data model returns an **array** from day one.
- **Format list** — radio-group semantics, arrow-key navigable, rows like:
  - `1080p — MP4 · 142 MB`
  - `720p — MP4 · 68 MB`
  - `Audio only — MP3 · 4.1 MB`
  Selected row: 1px ink border + filled ink dot. Unselected: `--border` + hollow dot. Row hover: tint bg.
- **Action row:** primary `Download` (ink) + two quiet icon buttons: save-thumbnail, copy-direct-link (check feedback on success).
- `Analyze another` text link → resets to idle, input selected.

### 5.4 downloading
Action row is replaced (input still shows URL). Layout borrowed from the call-panel reference:
- 36px circular control: ring stroke in `--accent`, filling with progress; download glyph in center.
- Readout: `37.2 / 142 MB` (tabular nums).
- Meta: `2.4 MB/s · 43s left · 26%`.
- Thin 3px progress track under the card content: `--tint` bg, `--accent` fill.
- Quiet X button cancels (aborts the stream).
- Progress pushed via SSE; bar width transitions ≤200ms so it glides instead of jumping.

### 5.5 done
- Ring completes; glyph swaps to a checkmark that draws in (SVG stroke animation).
- Readout: `Saved — caption-1080p.mp4 · 142 MB`.
- Button becomes `Download another` → reset to idle, input cleared and focused (desktop).
- No confetti. It's a tool, not a party.

### 5.6 error
Inline in the card (no toasts), 12px `--danger` + 14px icon. Honest, human copy — never raw stderr:

| Case | Copy |
|---|---|
| Unrecognized URL | `That doesn't look like a link we know. Double-check it and try again.` |
| Login required | `{Platform} is asking for a login for this content — we can't reach it.` |
| Extraction broke | `We couldn't get this one — the site recently changed something. We're on it.` |
| Network | `We couldn't reach the site. Check the link or try again in a moment.` |

Each with a `Try again` action that selects the input text.

---

## 6. Motion spec

### 6.1 Page entrance (on load, once)
Staggered fade-up: kicker → H1 → sub → card. Each: opacity 0→1 + translateY(12px)→0, 480ms, `cubic-bezier(0.16, 1, 0.3, 1)`, 60ms stagger. The card adds scale(0.98)→1.

### 6.2 Scroll reveals
Feature strip + platform line. IntersectionObserver, fade + 10px rise, 320ms, 70ms stagger per block, fires once.

### 6.3 Micro-interactions

| Element | Trigger | Behavior |
|---|---|---|
| Input | focus | border → ink, 150ms |
| Paste button | click | clipboard icon → check, 120ms |
| Submit | analyzing | button content crossfades to spinner, 150ms |
| Result card | enter | scale 0.98→1 + fade, 240ms |
| Format row | select | dot fills + border color, 120ms |
| Primary button | hover / press | bg lightens 120ms / scale(0.98) 80ms |
| Progress ring | update | stroke tracks %, ≤200ms glide |
| Done check | enter | stroke-dashoffset draw, 400ms ease-out |
| Copy link | success | icon → check 1s → revert |
| Theme toggle | click | color crossfade 200ms, no flip gimmick |
| Card (desktop, idle only) | hover | translateY(−1px) + shadow up, 150ms |

### 6.4 Motion rules
- Max two animated properties per element.
- Duration range: 80ms (press) → 480ms (entrance). Easing: ease-out family only.
- `prefers-reduced-motion`: all translate/scale become opacity-only; shimmer becomes a static pulse.

---

## 7. Responsive (mobile-first)

Most real users paste links from phones — design 375px first.

- **375px:** nav 48px, H1 30px, card full-width, input row single-line (input flexes; Paste becomes a 44px icon-only square), format rows single-line label + size.
- **≥768px:** 640px column, slightly stronger card shadow, input autofocus.
- **Post-v1 (PWA):** Android share-target opens the app with the URL pre-filled and auto-analyzes. The idle state must look intentional when it arrives pre-filled.

---

## 8. Accessibility & performance

- Contrast: `--ink`/`--ink-2` pass 4.5:1 on all surfaces; `--ink-3` used only for non-essential meta.
- `:focus-visible` rings everywhere: 2px `--accent`, 2px offset.
- Format list is a real radio group (arrow keys, `aria-checked`); progress exposes `aria-valuenow` in a polite live region; analyzing sets `aria-busy`; errors use a polite live region.
- Theme from `localStorage` applied pre-paint via inline script — no flash of wrong theme.
- Thumbnail uses `aspect-ratio` sizing — zero CLS on analyze→result.
- Progress counters update at most 2×/second (tabular nums prevent width jitter).
- Lighthouse targets: a11y ≥ 95, CLS 0, LCP = the tool card.

---

## 9. Copy & tone

Lowercase wordmark; sentence case everywhere else. No exclamation marks, no emoji, no "magic", no "AI-powered". Errors tell the truth (same principle as the engineering spec). Buttons are verbs: Paste, Download, Try again.

---

## 10. Scope

**In v1:** everything in this document, dark mode, MP3 format row, multi-media item selector.
**Out of v1:** crop presets (Instagram Story sizing etc.), share links/QR, GIF export, history, queueing, accounts, i18n. PWA manifest + share-target land immediately after v1 — the copy and layout must not need to change when they do.

---

## 11. Acceptance criteria

- [ ] First viewport at 375px contains wordmark, H1, input, and submit — usable with zero scroll.
- [ ] No gradient, blur, glow, or blue/purple anywhere in shipped CSS (skeleton shimmer excepted).
- [ ] All six card states reachable and animated per §5–6.
- [ ] Enter submits; Ctrl/Cmd+V pastes anywhere; arrow keys navigate formats.
- [ ] Tabular numerals on every ticking number; zero width jitter.
- [ ] `prefers-reduced-motion` variant verified.
- [ ] Dark mode complete, including skeleton and error states.
- [ ] Lighthouse a11y ≥ 95; CLS 0 across state transitions.

---

## 12. Build prompt (hand this to the implementer)

> Build a single-page Next.js (App Router, TypeScript) app with Tailwind and Framer Motion, one route `/`, Inter via `next/font`. Follow this PRD exactly: warm-paper flat hero field with a floating white tool card overlapping its bottom edge; ink-black primary actions; single green accent for progress/success/active; hairline 1px borders; 12px card radius; the small type scale in §3.2. The tool card is a client component driven by a `useReducer` state machine with the six states in §5 (idle, analyzing, result, downloading, done, error) and every micro-interaction in §6.3. Wire it to `/api/analyze` and `/api/download` (SSE progress) per the engineering spec. No design decisions beyond this document — where the spec is impossible in a browser, choose the quietest alternative.
