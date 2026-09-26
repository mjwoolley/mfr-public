---
id: CAP-041
title: Share purchase goal
area: accounting
status: implemented
source: recovered
related: [CAP-006, CAP-031, CAP-033, CAP-035, CAP-037, CAP-038]
---

# Share purchase goal

```gherkin
Feature: Share purchase goal
  This fiscal year's sales against a goal, incl. the Venmo option.
  Capability: CAP-041

  Scenario: An admin sets the goal for a fiscal year
    Given I am signed in as an accounting admin
    When I enter fiscal year 2026 and "Goal (shares)" 20,000 under "Fiscal-year share purchase goal"
    And I choose "Save goal"
    Then I see "Saved."
    And FY2026's goal is 20,000 shares

  Scenario: Saving again replaces that year's goal
    Given I am signed in as an accounting admin
    And FY2026's goal is 20,000 shares
    When I save a goal of 25,000 shares for fiscal year 2026
    Then FY2026's goal is 25,000 shares

  Scenario: A goal must be above zero
    Given I am signed in as an accounting admin
    When I save a goal of 0 shares
    Then I am told "Goal must be greater than zero"

  Scenario: Only share purchases in the current fiscal year count toward the goal
    Given the current fiscal year is FY2026 with a goal of 20,000 shares
    And 5,000 shares were purchased in FY2026 across all shareholders
    And 3,000 shares were purchased in FY2025
    And transfers and adjustments were recorded in FY2026
    When a linked shareholder opens their dashboard
    Then they see "FY2026 share purchase goal" with "5,000 of 20,000 shares"
    And they see "25% funded · 15,000 shares to go"

  Scenario: Corrected purchases don't count toward the goal
    Given a FY2026 share purchase has been corrected
    Then only the correction's shares count toward the FY2026 goal

  Scenario: Reaching the goal
    Given purchases this fiscal year have reached or passed the goal
    When a linked shareholder opens their dashboard
    Then the progress bar is full
    And they see "Goal met — thank you, everyone!"

  Scenario: No goal set
    Given no goal has been set for FY2026
    When a linked shareholder opens their dashboard
    Then they see "No share purchase goal set for FY2026 yet."

  Scenario: Contributing through Venmo
    Given the family's Venmo account is configured
    When a linked shareholder chooses "Contribute via Venmo" on their dashboard
    Then they see a QR code and "Open Venmo — <the family's Venmo handle>"
    And they are told "Share purchases are recorded to the ledger once received."

  Scenario: No Venmo option when it isn't configured
    Given the family's Venmo account is not configured
    When a linked shareholder opens their dashboard
    Then there is no "Contribute via Venmo" option

  Scenario: The home page shows the same total without signing in
    # The home page card itself is owned by CAP-006.
    Given 5,000 shares were purchased this fiscal year against a goal of 20,000
    When anyone, signed in or not, views the fundraising total
    Then it shows the current fiscal year, 5,000 raised and the 20,000 goal, with no names
```

## Open Questions

- **[low]** The goal form accepts any fiscal year from 2000 to 2100, but only the current year's goal is ever shown back to the admin. Past or future goals can't be reviewed. Is that enough? (`apps/mfr/app/accounting/admin/settings-cards.tsx:94-118`, `apps/mfr/app/accounting/admin/layout.tsx:17-18`)
- **[low]** Just below the goal, the percentage rounds up: 99.6% shows "100% funded · 0.4 shares to go" with a full bar. Is that acceptable? (`apps/mfr/lib/accounting/goals.ts:27-32`)

## Related Features

- CAP-006 Home page — shows the fundraising total and goal to everyone
- CAP-031 Shareholder dashboard — where the goal tracker and Venmo option appear
- CAP-033 Record a share purchase — purchases are what count toward the goal
- CAP-037 Transaction dates and fiscal year — the goal is per fiscal year
- CAP-038 Share purchases ledger — the goal card sits beside the ledger visibility setting
- CAP-035 Balance adjustments — adjustments don't count toward the goal

## Code References

- `apps/mfr/actions/accounting/goals.ts` — set/replace goal, validation
- `apps/mfr/app/accounting/admin/settings-cards.tsx:80-140` — goal form
- `apps/mfr/lib/accounting/goals.ts` — progress math and notes
- `apps/mfr/lib/accounting/ledger.ts:13-29` — "raised this fiscal year"
- `apps/mfr/app/accounting/dashboard/page.tsx:63-182` — tracker on the dashboard
- `apps/mfr/app/accounting/dashboard/venmo-dialog.tsx`, `apps/mfr/lib/accounting/venmo.ts` — Venmo option
- `apps/mfr/app/accounting/api/contributions/current-year/route.ts`, `apps/mfr/lib/portal.ts:45-57` — public total for the home page
- `apps/mfr/lib/accounting/goals.test.ts`, `apps/mfr/tests/accounting-integration/routes.test.ts` — tests

## Change Log

- 2026-09-26 — Recovered from code.
