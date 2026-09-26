---
id: CAP-040
title: Ownership report
area: accounting
status: implemented
source: recovered
related: [CAP-030, CAP-034, CAP-036, CAP-038, CAP-046]
---

# Ownership report

```gherkin
Feature: Ownership report
  Who owns what share of the house.
  Capability: CAP-040

  Background:
    Given I am signed in as an approved member

  Scenario: Every current owner with their shares and percentage
    Given three shareholders hold 500, 300 and 200 shares
    When I open the "Ownership report"
    Then I see "1,000 shares outstanding across 3 shareholders."
    And they are listed largest first with 50.00%, 30.00% and 20.00%

  Scenario: Shareholders with nothing are left out
    # Many past owners have fully transferred out, including many who have passed away.
    Given a shareholder has transferred away all their shares
    When I open the ownership report
    Then they are not listed

  Scenario: My own row is highlighted
    Given I am linked to a shareholder record that holds shares
    When I open the ownership report
    Then my row is highlighted and tagged "You"

  Scenario: Corrected entries don't count
    Given a shareholder's purchase has been corrected
    When I open the ownership report
    Then their shares reflect only the correction, not the corrected original

  Scenario: Entries count before they are approved
    Given a share purchase for a shareholder is still waiting for their approval
    When I open the ownership report
    Then that purchase is already included in their shares
```

## Open Questions

- **[medium]** The table only lists active shareholders above zero, but the total outstanding also counts negative balances and deactivated shareholders' holdings. The footer is always "100.00%" anyway, so the rows can disagree with the total. A negative balance (possible via transfers, see CAP-034, or the correction defaults, see CAP-036) is hidden silently. Should the report list or warn about these? (`apps/mfr/app/accounting/ownership/page.tsx:15,73`, `apps/mfr/lib/accounting/ledger.ts:49-76`)

## Related Features

- CAP-030 Accounting access and tabs — every approved member can read this report
- CAP-038 Share purchases ledger — the detailed activity behind these balances
- CAP-046 Shareholder records — deactivated records are left out of the list
- CAP-034 Share transfers — transfers can leave negative balances hidden from the report
- CAP-036 Transaction corrections — corrections change the balances the report shows

## Code References

- `apps/mfr/app/accounting/ownership/page.tsx` — report, zero-balance filter, "You" highlight, footer
- `apps/mfr/lib/accounting/ledger.ts:40-76` — balances and total outstanding
- `e2e/tests/accounting-flows.spec.ts:180-194` — ownership split

## Change Log

- 2026-09-26 — Recovered from code.
