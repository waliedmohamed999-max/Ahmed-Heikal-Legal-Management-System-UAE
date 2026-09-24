# Visual Audit — before Phase 11A redesign

**Scope:** 37 views (31 staff, the client portal, 4 public-site pages, login). Each was captured on desktop 1440×900, tablet 768×1024 and mobile 390×844, in Arabic and English: **222 screenshots**.
**Source:** production build at commit `a9ca87c`, with the synthetic demo data.
**Screenshots:** `docs/screenshots/before/<device>/<locale>/<view>.jpg`
**Automated check:** each capture recorded horizontal overflow (page wider than the viewport).

The product is functionally complete and already token-based. The problems are architectural, not cosmetic. Almost every view is built from the same ingredient: a bordered **Panel** with an icon and title, stacked in a 12-column grid. As a result, the dashboard, the case overview, hearing preparation and the team page all read as "a wall of equal boxes". Nothing leads, and everything competes.

---

## 1. What looks outdated

- **Dark navy sidebar with a white "Quick create" slab.** This is the classic 2018 admin-template silhouette. The white button is the brightest object on every screen.
- **Dark banners inside a light page.** The next-hearing block on the dashboard and the hearing-prep header are both dark, as are the public-site hero and CTA band. Three heavy dark blocks per journey feel like a theme, not a product.
- **Countdown as big monospace digit tiles** (`00 : 06 : 53`). This is a stopwatch aesthetic, and it's oversized for its meaning.
- **Demo banner in near-black above the top bar.** It creates two stacked dark strips on top of the page.
- **Team as employee cards** with a 4-stat grid and progress bar each: an HR-directory pattern.
- **Public site** built from dark hero, 4 numbered cards, FAQ and dark CTA band is a generic law-firm theme with no About or How-we-work story.

## 2. What feels generic

- Every section header follows the same pattern: `[icon] Title ……… View all`. Nearly 40 instances across the app, all visually identical.
- Stat tiles appear on the dashboard, case health, team cards and finance. They are always a small grey label over a big number in a box.
- **Case list:** the page header, 14 view pills, a filter row, a second toolbar row and then the table. The table gets only 55% of the first screen.
- **Documents:** a table in a card with an "Upload" button floating alone in an empty header strip.
- **Calendar:** colour-chip legend above the grid **and** a duplicate legend below it.

## 3. Visually noisy

- **Top bar next-hearing strip.** It packs label, record ID, title, date, countdown, status badge and three text links into 52px. It's the busiest line in the product, and it repeats the dashboard's hearing block.
- **Dashboard:** 9 panels, 5 different list-row styles, 4 badge colours per row in "Critical deadlines", plus countdown dots.
- **Badges for everything.** Alert level, priority, status, source, kind and "Needs verification" often appear three per row. The case table puts both a priority pill and a status pill on every row.
- **Checklist:** strike-through plus green ticks in two columns, with a heavy progress bar.
- **Timeline:** each event repeats date, category label, title, body, user icon and time. The meta line is louder than the content.

## 4. Weak hierarchy

- **Dashboard.** The greeting, 7 brief chips, the Customise button and the primary "View today's agenda" button all sit at the same level. The next hearing, the single most important object, is one panel among nine.
- **Case header.** The title is only slightly larger than the 12 metadata items spread over two rows and six columns. Team avatars, dates, countdowns and amounts all carry equal weight.
- **Case overview.** Summary, current status, last action, next action, parties, checklist, health, risk, portal, activity and record info appear as 10 equal boxes. Nothing says "this is what matters now".
- **Hearing preparation.** The work area (questions, arguments, notes) is only 50% width, and six side boxes compete with it.

## 5. Oversized

- **Hearing countdown tiles.** They're 44px tall with labels, repeated on the dashboard, the prep header and the case hearings tab.
- **Page title blocks.** Each has a 22px title, a sentence of subtitle and 24px of margin before any data (Cases, Documents, Team, Finance).
- **Table rows.** Case rows are 48px with two-line cells, so the table fits 8 rows at 1440×900.
- **Buttons and inputs.** 36px controls with shadows make toolbars look heavy.
- **Mobile bottom-nav centre "+" button.** It's a 40px dark disc with shadow.

## 6. Wastes space

- **Sidebar.** At 244px, around 40% of its height is empty on desktop. The search field inside the sidebar duplicates ⌘K.
- **Content width.** Content is capped at 1200–1440px with 32px side padding, while the canvas around it stays empty on 1920px screens.
- **Documents page.** An empty toolbar strip sits above the table, and 250px of blank area follows the last row.
- **Team page.** Each person gets a 170px-tall card for four numbers.
- **Case overview on tablet.** Parties, checklist and health stack at full width, one per row. The page is 2,575px tall before reaching activity.

## 7. Inconsistent

- **Four "list row" implementations:**
  - `EventRow`
  - the task rows on the dashboard
  - the approvals rows
  - critical-deadline rows

  Each has its own padding (10–12px), meta separators and trailing element.
- **Tabs:**
  - route tabs on case, settings and finance
  - pill views on the case list
  - segmented day/week/month on the calendar

  They use three unrelated styles.
- **Status display:** filled pill in tables, coloured text in the dashboard task list, dot + text in countdowns.
- **Empty states:** some show a large icon box, some show "—", some show a centred sentence.
- **Headers:** some pages use `PageHeader`; hearing prep uses a dark banner; case detail uses a custom header; the dashboard has its own greeting block.
- **Radius and shadow:** panels use `rounded-lg shadow-xs`, overlays `rounded-lg shadow-lg`, the hearing block `shadow-md`. The quick-create button has its own shadow.

## 8. Difficult to scan

- **Case list:** the matter title, internal ID and official number are stacked in two lines of equal contrast. The "Next event" column mixes an icon, a date and a coloured countdown on two lines.
- **Critical deadlines:** the alert pill leads each row, so the eye reads the colour before knowing what the item is.
- **Activity feed:** a verb phrase in grey inside a sentence ("Sara Mansour uploaded version 3 of …") with record IDs under it. The case name is the last thing you see.
- **Finance snapshot:** amounts are right-aligned next to counts, and the labels sit above them in the same grey.

## 9. Arabic vs English differences

- **User content in English inside Arabic pages is not direction-isolated.** Punctuation jumps to the wrong side (".Filed with court", ".Awaiting expert accounting report"). Affected: summaries, timeline bodies, notes, prep notes, portal status text. **Fix:** `dir="auto"` on all user-authored text.
- **Arabic row heights run ~15% taller than English.** The body line-height of 1.65 inflates every list and table row.
- **Truncation cuts titles from the wrong side.** Mixed Arabic/English titles in the mobile agenda begin with "…".
- **Record IDs are mostly isolated**, but some meta lines join them with "·" in a way that flips order ("AH-2026-00001 · 24 سبتمبر").
- The sidebar collapse chevron and the "View agenda" arrow are mirrored correctly. The calendar week view keeps a left-to-right hour gutter, which is correct.

## 10. Responsive failures (measured)

| View | Mobile overflow (EN / AR) |
|---|---|
| Agenda | 268px / 268px |
| Team member | 238px / 146px |
| Finance | 227px / 182px |
| My Work | 161px / 37px |
| Client profile | 110px / 15px |
| Dashboard, hearing prep, invoice | 6–15px (EN) |

- **Mobile dashboard is 8,000px tall** because every desktop widget is stacked, including workload, portfolio and finance.
- **Mobile tables** (cases, documents, invoices) are horizontally scrolling desktop tables, not record lists.
- **The fixed mobile bottom bar overlaps content** mid-page in several views (seen in full-page captures).
- **Tablet (768px) is shrunk mobile:** the sidebar becomes a hamburger drawer, the top bar crams the hearing strip, and the case header metadata becomes a 3-column wall.

---

## Priorities carried into the redesign

1. **One shell:** light sidebar grouped as the brief requires (Home · Cases · Clients · Calendar · Documents · Tasks · Finance | AI · Reports | More), a 48px top bar with breadcrumb, search launcher, create, notifications and profile, and a white working surface.
2. **Replace the panel wall** with regions: section headers on the working surface, key-value lists, inline stats, timelines and compact rows.
3. **Next Hearing** becomes one purposeful light panel on the dashboard. The top-bar strip is reduced to a small chip.
4. **Tables:** 40/32px density toggle, one-line primary cell with a secondary line, quiet status (dot + text), filter dropdowns with chips.
5. **Case workspace:** compact header, sticky sub-nav, 70/30 overview.
6. **Mobile:** its own layouts (record lists, a reduced dashboard, 5-item bottom nav) and zero horizontal overflow.
7. **RTL:** `dir="auto"` on user text, Arabic line-height 1.5, record IDs always isolated.
