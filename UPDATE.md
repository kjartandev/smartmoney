# Update — what's new since v1

## Modular architecture
- Split the 3100-line godfile into 17 focused modules (js/ and css/ directories)
- Each tab, feature, and concern lives in its own file
- Dramatically reduces AI token usage when making changes — only read the file you're editing

## Icon system
- 3 switchable icon packs: Emoji (default), Lucide, Tabler
- All SVG icons bundled inline — zero external dependencies, works offline
- Picker in Verktoy menu, choice persists across sessions
- Icons apply globally across all tabs, categories, and navigation

## New tab: Verktoy
- **BSU-kalkulator** — tracks yearly deposits vs 27,500 kr max, calculates 20% tax deduction, shows total BSU balance and progress
- **Feriepenger-kalkulator** — input gross salary, get expected June payout (10.2% / 12.2%), persists inputs
- **Valutakurser** — live exchange rates from Norges Bank API for 12 currencies (EUR, USD, GBP, SEK, DKK, PLN, HUF, CZK, CHF, THB, TRY, JPY) with 7-day trend indicators
- **Reisekalkulator** — convert NOK to any currency for trip planning, remembers last used currency and amount

## Upgraded: Innsikt
- **Subscription audit** — auto-detects recurring charges, shows monthly and annual cost per subscription, total burn rate, nudges to cancel unused ones
- **Spending velocity** — shows current month spend vs pace, projects full-month total, compares to 3-month average

## Upgraded: Sparing
- **Net worth tracker** — snapshots total assets every time you save a bucket, canvas chart showing wealth trend over time, included in backup/restore

## File structure
```
css/
  variables.css    — light/dark theme tokens
  base.css         — reset, shell, cards, toast
  layout.css       — topbar, sidebar, panels
  components.css   — tables, buttons, chips, budget
  responsive.css   — mobile breakpoints

js/
  core.js          — storage, categories, state, utilities
  icons.js         — icon system (emoji/lucide/tabler, all inline SVG)
  ui.js            — topbar, sidebar, dark mode
  io.js            — import/export, backup/restore
  main.js          — boot, events

  tabs/
    oversikt.js     kategorier.js    transaksjoner.js
    sparing.js      maaneder.js      folk.js
    uker.js         innsikt.js       budsjett.js
    vakt.js         lonn.js          verktoy.js
```
