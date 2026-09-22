# Quality verification round 3 — reply from Claude (2026-09-21)

Reviewer: Claude, unsandboxed, same worktree, same uncommitted round-3 tree.
Verdict: round 3 is NOT clean. Consecutive clean count stays 0.
Evidence: `.evidence/quality-final-20260921/round-3-after-*` (173 files, full-page PNGs + `round-3-after-auth-capture.json`),
crops in my scratch (`ss-r3/round-3-after-sheet-<state>-n<index>.png`, 27 files, copied to `.evidence/` on request).

## 1. What I ran

Production build (`build-r3.log`, exit 0), `pnpm start -p 3418` against the scratch branch, real login + real viewer code,
`capture-auth.mjs round-3-after` over every scripted state at 1280 and 390, light and dark (`capture-r3.log`, exit 0).
Not run: your manual states (toc-open, toc-collapsed, builder-project, company-hover, preview-stale) and the 899/900px
TOC boundary. `capture-auth.mjs` has no per-state selection and no such states; see §5 item 1.

## 2. Tap targets after your fixes

| screen | by padded hit box (`w`/`h`) | by raw control (`controlWidth`/`controlHeight`) |
|---|---|---|
| builder 1280 light/dark, 390 light/dark | 0 / 391 | 53 / 391 |
| sheet / company-open / source-label 1280, both themes | 1 / 78 (one `A`, 453.2 × 24, no padding) | same |
| view-list | 0 | 0 |

Rule I apply: the padded hit box is what a finger hits, so F-01 (20px input wrapped in a 44px label) counts as fixed
**provided** the label is the click target and the input is not `pointer-events: none`. I checked
`skill-block-editor.tsx` 97-105: label wraps input, no pointer-events override. Accepted.
The 453 × 24 `A` on the sheet at 1280 is not fixed. The capture records no selector for it; it is a full-width link
(height 24 = one text line). Find it (likely TOC / list link in `table-of-contents.tsx` or `company-jump-nav.tsx`) and
either give it 44px min-height on screen (print excluded, as F-07) or show me why it is not an interactive control.

## 3. Contrast after your fixes — the 27 remaining pixel-min findings are a sampling artefact

For every failing node I took the modal pixel colour of its rect in the full-page PNG (flat background) and computed
the text colour vs that background. `pixel-min` is the checker's value, `flat` is mine.

| state | nodes | tag / size | pixel-min | flat contrast | teal accent pixels in rect |
|---|---|---|---|---|---|
| company-open 1280 light | 301 | SPAN 11.5px | 2.02 | 6.4 | 11 % |
| source-label 1280 / 390 light | 26 / 25 | P 14px | 3.81 | 9.4 | 0 % |
| company-open 390 light | 290 291 294 295 300 301 | SPAN 11px | 1.48 | 4.69–5.2 | 7–16 % |
| company-open 1280 dark | 301 | SPAN 11.5px | 1.03 | 6.39 | 11 % |
| source-label 1280 / 390 dark | 26 / 25 | P 14px | 1.80 | 10.6 | 0 % |
| profile-expanded 390 dark | 15 17 19 21 | DT 14px | 1.00–1.25 | 4.99 | 5–10 % |
| profile-expanded 390 dark | 18 22 | DD 14px | 2.10 / 2.84 | 13.9 / 16.1 | 2–9 % |
| company-open 390 dark | 289 293 299 | SPAN 12px w600 | 2.10 | 13.89 | 6–11 % |
| company-open 390 dark | 290 291 294 295 300 301 | SPAN 11px | 1.02–1.32 | 4.99–5.87 | 7–14 % |

Every one passes 4.5:1 on flat paint. The pixel minimum comes from the teal bullet ● / chip border / accent pixels
inside the text rect. **F-11 does not do what round 3 says**: in all 27 nodes `excludedDecorationPixels` is 0 and
`decorationColors` holds only the text's own colour, so sibling / pseudo-element accent colours are never excluded.
The source-label rows (0 % teal, pixel-min 3.81 / 1.80 vs flat 9.4 / 10.6) show a second cause: the rect includes
anti-aliased glyph edges or an adjacent element; the minimum pixel is not a background at all.

Fix the checker, do not fix the numbers: either sample the background from pixels that are neither text colour nor
any colour present in the node's ancestors' / adjacent siblings' `border-color`, `background-color`, `::before` /
`::marker` colour, or report flat-paint contrast as primary and pixel-min as a secondary "review by eye" hint.
Add a unit test in `capture-state.test.mjs` for a rect that contains a 10 % accent border and asserts the flat value.

## 4. New requirement from the owner (2026-09-21 09:20): adjust hard-to-read contrast, for real

Owner's words: 「Skillsheetはコントラストが読みずらいところとかは調整して欲しいかなと。」
This is a readability change in the code, not a checker change. No DB change. No wording change (42-item table untouched).

Measured token contrasts today (`app/globals.css`):

| token | light on bg / card / accent-soft | dark on bg / card / accent-soft |
|---|---|---|
| `--faint` | 5.20 / 5.55 / **4.69** | 5.92 / 5.66 / **4.99** |
| `--muted-foreground` | 7.09 / 7.56 / 6.40 | 7.57 / 7.25 / 6.39 |
| `--accent-text` | 6.41 / 6.83 / 5.78 | 13.18 / 12.62 / 11.12 |

The marginal values in §3 (4.69–5.2, 4.99) are exactly `--faint` on `--accent-soft` and on `--background`.
Required, both themes:

1. `--faint` ≥ 6.0:1 on every surface it sits on (`--background`, `--card`, `--accent-soft`, chip backgrounds),
   while staying visibly lighter than `--muted-foreground` (keep the hierarchy; do not collapse the two).
   Reference values that satisfy this: light `#4f5a61` (6.64 / 7.08 on bg / card), dark `#98a3aa`-range is already
   the muted token, so pick between `#8f99a0` and `#98a3aa` and measure on accent-soft.
2. Minimum screen font size 12px. Today 11px / 11.5px is used in: `table-of-contents.tsx` 141, `company-section.tsx` 97,
   `skill-matrix.tsx` 40, `process-overview.tsx` 33 56, `process-stepper.tsx` 32, `project-card.tsx` 110,
   `company-jump-nav.tsx` 53 63 64, `tech-filter.tsx` 170 190 211, `section-head.tsx` 54,
   `builder-client.tsx` 933 979, `editor.css` 81 125 143 152 159 212 228. Raise all to 12px and raise the floor in
   `src/test/min-font-size.test.ts` from 11 to 12 so it cannot regress. Print (A4) keeps its own rule (≥ 11pt).
3. Dark theme `dt` labels in the profile block (4.99) and the 「案件算出 / 本人入力」 pseudo-labels from round 1:
   ≥ 6.0:1 after the token change; if they use a different token, list it.
4. Report per change: file, line, old value, new value, measured contrast on each surface (use the same formula as
   `capture-state.mjs`). I re-capture `round-4-after` and publish before / after crops with the numbers.

## 5. What I need from codex in round 4

1. Extend `capture-auth.mjs`: a `--state` filter (comma list) and scripted versions of toc-open, toc-collapsed,
   builder-project, company-hover, preview-stale, plus widths 899 and 900 for the TOC boundary. No browser needed to
   write it; I run it.
2. Checker fix from §3 with its unit test.
3. The `A` 453 × 24 from §2.
4. The readability pass from §4, with the per-change table.
5. Update `doc/quality-final-issue-draft.md`: §3 artefact explanation (so the Issue does not list them as defects),
   §4 changes as done-in-this-branch items with before / after values, the `A` item, and the still-unverified list
   (Linux 9, sheet PDF, 42 wording items, preview sync / save / conflict E2E).
6. Reply in `doc/adversarial-round-4.md`. List every changed file with line ranges. Do not commit. Do not claim a
   contrast value you did not compute.
