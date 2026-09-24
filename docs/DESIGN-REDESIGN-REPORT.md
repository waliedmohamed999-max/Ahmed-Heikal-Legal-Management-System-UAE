# Phase 11A — Visual Redesign & UX Re-architecture: report

**Scope:** visual design, information architecture and layout only. No features were added, and no routes, permissions, database schema or business logic changed. Every redesigned view renders the same real data through the same services.

**Before:** [`VISUAL-AUDIT.md`](VISUAL-AUDIT.md), with 222 screenshots in `docs/screenshots/before/`.
**After:** `docs/screenshots/<device>/<locale>/`. The list is at the end of this report.

---

## 1. Design system (the foundation)

All tokens live in `src/app/globals.css`. No page defines its own colours.

| Token group | Decision |
|---|---|
| **Colour** | Warm-neutral canvas `#F7F7F5` (chrome) and white working surface. Near-black ink `#15171C`, slate secondary text. **One accent: deep navy** (`--brand #172440`, `--accent #1F3C78`). Status colours (success, warning, danger, info, critical, high) are muted and used **only for meaning**. Event-type colours are desaturated. No gradients, glass, gold or neon. |
| **Type** | Inter (Latin) and IBM Plex Sans Arabic (Arabic). Named scale: `caption 11 · meta 12 · body 13 · ui 14 · heading 15 · title 20 · display 24`. **All ~390 arbitrary sizes in the app were mapped to the scale.** Arabic line-height dropped from 1.65 to 1.5 so Arabic rows are no longer ~15% taller than English. |
| **Spacing** | 4-pt scale: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48. Pages share one container (`<Page>`) with consistent gutters. |
| **Radius** | 4 (chips), 6 (controls), 8 (sections), 10 (overlays), 12 (modals). No `rounded-2xl/3xl` cards. |
| **Elevation** | Borders first. Shadows only on floating layers (menus, drawers, modals). Every `shadow-xs` was removed from bordered panels. |
| **Layers & motion** | z-index tokens (sticky 20, header 30, overlay 50, toast 60). Motion is 150–200 ms (fade, slide-up, drawer-in, with an RTL variant), and `prefers-reduced-motion` is respected. |
| **Density** | 32 px controls on desktop, 40 px with 16 px text on phones (touch target, no iOS zoom). Table rows are 40 px, or 32 px in compact mode. |

`tailwind-merge` was extended with the type scale. Without this, `text-body` would silently strip colour classes such as `text-brand-fg`: the primary buttons were rendering dark-on-navy until this was fixed.

## 2. Components created or rebuilt

| Component | Change |
|---|---|
| `Page` | **New.** Width system: full / default / narrow / text. |
| `PageHeader` | Compact: 20 px title, optional subtitle and meta line. |
| `SectionHeader`, `SectionLink` | **New.** Region headings with counts; quiet "View all". |
| `Panel` | Hairline section, **`plain` mode** (heading plus rule, no box), count chip, no shadow. |
| `DetailList` | **New.** Key-value list, replacing "a card per value". |
| `InlineStats` | **New.** A single strip of figures separated by hairlines, replacing stat-card rows. |
| `EntityRow` | **New.** Leading · title · meta · trailing row. |
| `Timeline` | **New.** Vertical timeline with time column, marker, meta, body and highlight. |
| `Segmented` | **New.** List/Grid, density and view switches. |
| `StatusText`, `PriorityText` | **New.** Quiet dot-plus-text status and a bar-glyph priority, never colour alone. They replace filled pills in dense tables. |
| `Badge` | Smaller (18 px). Now reserved for status, verification and confidentiality. |
| `Button` | Heights 24/28/32/40, no shadows, one primary per view. |
| `Input`, `Select`, `Textarea`, `Field`, `FormSection` | Unified height, label above, helper below, error below. `FormSection` is new, for settings-style forms. |
| `Table` | Quiet sticky header and comfortable/compact **density**. |
| `DialogContent` / `SheetContent` (drawer) | 12 px modals without a blurred backdrop. Drawers slide in from the reading side, with a footer slot and size prop. |
| `FilterMenu`, `FilterChips`, `SearchField`, `DensityToggle` | **New** filter system (`src/components/filters.tsx`): dropdown filters, removable chips with "Clear all", debounced search, and density saved in a cookie. |
| `ListSearch` | Rebuilt on the filter system; used by 8 list pages. |
| `DocumentTable` | Rebuilt as a document manager: toolbar slot, List/Grid view, Owner column, phone record list. |
| `EmptyState`, `Skeleton`, `Kbd`, `Avatar`, `AvatarStack`, `LinkTabs` | Line-icon empty states. Underline tabs with quiet counts. |
| `.bidi-plain`, `.record-id`, `.eyebrow` | **New utilities:** per-paragraph bidi for user text, never-wrapping LTR record IDs, and micro-labels (no letter-spacing in Arabic). |

**Removed or retired from use:** the dark sidebar, the white "Quick create" slab, the top-bar next-hearing strip (`NextHearingStrip`), the countdown digit tiles (`CountdownBlocks` is no longer used by any page), stat-card grids on the dashboard, client profile, finance and team pages, employee cards, and filled status pills in tables.

## 3. Navigation changes

- **Sidebar, light, 232 px.** Collapses to a 64 px icon rail. Below 1280 px (tablet and small laptops such as 1024) it is always the icon rail, so content keeps its width.
  - **Workspace:** Home, Cases, Clients, Calendar, Documents, Tasks, Finance.
  - **Intelligence:** AI, Reports.
  - **More:** an inline disclosure containing Team, Approvals (with count), Knowledge, Templates, Leads, Contacts, Today, Planner, Appointments, Court import, Resources, Integrations, Website, Audit and Settings.
  - **Active state:** subtle surface, thin indicator, strong text.
  - **Footer:** the always-visible **Next hearing** mini-card (required by the original brief), shown as an icon in the rail.
- **Top bar, 48 px.** Section breadcrumb, a small "Demo data" chip, a compact **search launcher** ("Search cases, clients, documents…" ⌘K), **New**, notifications and a **profile menu** holding language, appearance, shortcuts and sign-out. The dark demo banner is gone.
- **Mobile.** Bottom navigation: Home · Cases · Calendar · Tasks · More. More opens a sheet with every other destination. Tablet and phone show a next-hearing countdown chip in the top bar.

## 4. Pages redesigned

| Page | What changed |
|---|---|
| **Home (Command Center)** | The card wall became: greeting, then an inline stats strip, then a **Next Hearing** focal panel (light, with an accent rule), a **Today** vertical timeline, and a **Critical deadlines** compact table (item, owner, due, remaining; tinted when urgent). Tasks and approvals sit in compact lists, activity beside workload, and finance is one strip. The portfolio widget was removed as a duplicate. On mobile only the next hearing, today, deadlines and tasks show. |
| **Cases** | Title with count. **5 view tabs plus "More views"** (previously 14 pills). Search, dropdown filters, chips, sort menu, columns and density. The table shows a two-line matter cell (name, then ID · official number), quiet status and priority glyphs, and a single-line next event. On mobile the table becomes a record list. |
| **Case workspace** | Compact header: breadcrumb with ID, title, status · priority · type · stage, and one metadata line (client · court · lead · next hearing). Actions are **Add task · Upload · Schedule ▾ · More** (Edit, AI brief, note, close/archive). The **sticky sub-nav** includes People and Audit. The overview is **70/30**. Main: summary, latest update (key-value), recent timeline, open tasks, checklist. Side: next events, key details, team, parties, recent documents, health and risk, portal status. |
| **Hearing preparation** | Rebuilt as **focus mode**. A quiet header (case, when, court, room, lawyer, remaining) with Exit focus. One reading column: brief, previous decisions, arguments and questions, key documents, tasks, notes. A sticky "On this page" index plus parties. **Also fixed a permission gap:** documents on this page are now filtered by `documentScope` (per-document DENY and confidentiality), as everywhere else. |
| **Calendar** | A calendar sidebar holds scope, event types (as the legend, with counts) and team-member filter. The week view is primary, with a segmented view switch. The duplicate legends are gone. Event blocks are quieter, and the day view no longer forces a 640 px width. |
| **Deadlines (case tab)** | A table: deadline (type, alert level, source, case) · due · remaining · responsible · verification · actions. Critical rows get a faint tint instead of a red pill. |
| **Hearings (case tab)** | The digit tiles were replaced by an inline countdown. |
| **Clients** | The list uses the new filter system. The **client profile** has a CRM-style header and route **tabs** (Overview · Cases · Documents · Meetings · Finance · Communications); the overview shows main content beside a details, contacts and portal side column. |
| **Documents** | Document manager: search and filters toolbar, **List/Grid**, Owner column, compact phone records. The case documents tab uses the same component. |
| **Tasks** | A shared header with **My tasks / All tasks** tabs and a quiet bucket switcher with counts. Rows are 36 px with a priority glyph. My Tasks adds a side timeline of hearings and deadlines. |
| **Team** | Employee cards became a **table** with workload indicators (descriptive only, as before). |
| **Finance** | The stat cards became a figure strip. The invoice status filter is a quiet segmented control. Status shows as dot-plus-text, and IDs and dates no longer wrap. |
| **Reports** | **Category sidebar** (Cases, Clients, Team, Finance, Documents) and a period switch. Only the chosen category is shown, not every chart at once. |
| **Approval Center** | A **work-queue inbox**: filters (Pending/Decided, type with counts), a list, and a **preview with the decision**. Access requests are part of the same queue. |
| **AI Assistant** | **Three panes.** Left: case, tools, history. Centre: composer, then output. Right: **Sources** as numbered references (`[1] Contract.pdf · p.12`, which open the document) and case context. |
| **Knowledge** | **Library:** categories with counts, an entry list, and a reading preview. Editing stays in a dialog. |
| **Settings** | Left-nav rail and an 880 px content column. Sessions show a readable device summary instead of raw user-agent strings, limited to 5 with "Show more". |
| **Client portal** | Light header. Each case shows status, the office's status message, next hearing, latest update, then messages and uploads. Upcoming, documents and invoices follow as simple lists. |
| **Public website** | Typographic light hero (name, position, value proposition, two CTAs), a neutral **portrait area** until a real portrait is supplied, trust points, simple practice-area cards, **About**, **How we work** (4 steps), insights, FAQ, a light CTA band and a light footer. No stock imagery, dark bands or gold. |
| **Booking** | **Two steps with a progress indicator:** service & time, then your details. |
| **Sign-in (staff, MFA, portal)** | One centred column on the canvas (logo, form card, security note). The dark art panel is gone. |

Every other page inherits the new tokens and components: agenda, planner, contacts, CRM, appointments, CMS, templates, audit, integrations, court import, invoice and print pages, and the settings sub-pages.

## 5. Responsive changes

- **Phones (390/430):** bottom nav, record lists instead of scrolling tables (cases, documents, team), a reduced dashboard, stacked case header with icon-only actions, horizontally scrolling sub-nav, 40 px controls.
- **Tablet and small laptop (768–1279):** icon-rail sidebar (not a hamburger), two-column layouts where they fit.
- **Cases table:** columns are shown by width. Case, client, next event and status are always shown. Type, lawyer, stage and priority are shown from 1280 px, and court from 1536 px. The document table hides Owner below 1536 px.
- **Overflow fixes:**
  - The audit found **13 mobile views** overflowing by up to 268 px. The cause was CSS grids without an explicit mobile column, so wide children (scrolling tables, the day grid, the booking date strip) stretched the implicit track.
  - All such grids now declare `grid-cols-1`, and the day grid no longer forces a minimum width.
  - Record IDs never wrap.

## 6. RTL changes

- **User text:** user-authored text (summaries, notes, timeline, portal status, titles) uses `.bidi-plain`. Each paragraph gets the right punctuation side (".Filed with court" is fixed), while alignment follows the page.
- **Record IDs:** always isolated LTR monospace (`.record-id`).
- **Directional details:**
  - Arabic line-height is tuned, and the eyebrow labels drop letter-spacing.
  - The drawer animates from the reading side.
  - The sidebar indicator, chevrons, breadcrumb separators and pagination are mirrored.
  - Report bars grow from the start edge.
- The calendar keeps its time gutter, and times, amounts and dates stay readable (`ltr-nums`).

## 7. Before → after (issues from the audit)

| Audit finding | Resolution |
|---|---|
| Dark admin sidebar with a white slab | Light 232/64 px sidebar; one "New" button in the top bar |
| Three heavy dark banners per journey | None. The only inverse surface left is the tooltip. |
| Top bar crammed with the hearing strip | 48 px bar; next hearing moved to the sidebar footer (chip on small screens) |
| 9-panel equal-weight dashboard | Focal next hearing, today timeline and compact lists; 8 widgets, all toggleable |
| Case header with 12 metadata items in two rows | Title, a status line and one fact line; details moved to the overview side column |
| 14 view pills | 5 tabs plus More views |
| Badges on everything | Dot-and-text status and priority glyphs; badges only for status, verification and confidentiality |
| Four different list-row styles | `EntityRow`, `Timeline` and table rows share one spacing and hover system |
| Inconsistent empty states | One line-icon `EmptyState` |
| 8,000 px mobile dashboard | Reduced mobile dashboard (about 3,600 px, mostly the timeline and deadlines) |
| Mobile overflow on 13 views | Fixed at the source (explicit grid columns) |
| English punctuation flipped in Arabic | `.bidi-plain` |

## 8. Verification

- `tsc --noEmit`: 0 errors. `eslint`: 0 errors, 1 informational notice (react-hook-form `watch()` cannot be memoised by the React Compiler).
- Unit tests: 49/49. Integration (real database): 9/9. E2E (Playwright, desktop and mobile): 18/18, and passing again on an immediate re-run.
- E2E changes caused by the redesign:
  - The booking test now clicks **Continue** (two-step form).
  - The login test checks the next hearing in its new place: the sidebar footer, or the top-bar chip on smaller screens.
  - Tests now reuse one session per account instead of logging in through the form for every test. The login rate limit (10 per account per 15 minutes) was tripping on repeated runs; the limit itself was not changed.
- Bugs found and fixed during verification:
  - Case tabs rendered while the layout was showing "Restricted matter" and threw a server error. Nothing was disclosed. Every tab now returns early unless the workspace is accessible.
  - A missing React `key` on the Documents toolbar.
  - A hydration mismatch on relative session times.
- Visual QA: captured at 1440 desktop, 768 tablet and 390 mobile in Arabic and English for every main view, plus spot checks at 1920, 1366, 1024 and 430. 222 final screenshots (37 views × 3 devices × 2 languages) plus 12 spot checks, and 233 "before" screenshots in `docs/screenshots/before/`.

## 9. Remaining visual issues (honest list)

- **Pages restyled only through tokens:**
  - agenda, planner, CRM board, appointments, contacts
  - invoice and print pages, CMS, templates, court import, audit log
  - the settings sub-pages (roles, jurisdictions, reference editors, reminders, automations)

  They are consistent in colour, type, spacing and controls, but did not get individual layout re-architecture.
- **Case sub-tabs:** Timeline, Notes, Communications, Tasks, Finance and People still use bordered panels inside the new workspace shell.
- **Document detail:** kept its split layout (preview plus metadata panel). The preview pane is blank in headless screenshots because headless Chrome has no PDF viewer.
- **Portrait:** the website portrait area is a neutral placeholder until the office uploads a real photo.
- **Drawers vs. pages:** the brief asks for drawers for quick client view and team profile. Team members and clients still open as full pages. The task detail and notification centre are drawers.
- **Dark mode:** tokens exist and were updated, but QA focused on light mode, as the brief asked.
- **No automated visual regression:** there are no automated screenshot comparisons; the screenshots are for human review.
