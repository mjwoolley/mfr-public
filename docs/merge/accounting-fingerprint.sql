WITH counts AS (
  SELECT
    (SELECT count(*) FROM "Shareholder") AS shareholders,
    (SELECT count(*) FROM "Shareholder" WHERE active) AS shareholders_active,
    (SELECT count(*) FROM "Transaction") AS transactions_all,
    (SELECT count(*) FROM "Transaction" WHERE deleted=false) AS transactions_active,
    (SELECT count(*) FROM "Transaction" WHERE deleted=true) AS transactions_deleted,
    (SELECT count(*) FROM "LedgerEntry") AS ledger_entries,
    (SELECT count(*) FROM "TransactionApproval") AS approvals,
    (SELECT count(*) FROM "Expense") AS expenses,
    (SELECT count(*) FROM "ContributionGoal") AS contribution_goals,
    (SELECT count(*) FROM "AppSettings") AS app_settings
),
txn_types AS (
  SELECT jsonb_object_agg(k, v) AS by_type FROM (
    SELECT type::text AS k,
           jsonb_build_object('all', count(*), 'active', count(*) FILTER (WHERE deleted=false)) AS v
    FROM "Transaction" GROUP BY type
  ) t
),
expense_totals AS (SELECT count(*) AS cnt, coalesce(sum(amount),0) AS total FROM "Expense"),
expense_by_fy AS (
  SELECT jsonb_agg(jsonb_build_object('fy', fy, 'count', cnt, 'total', total) ORDER BY fy) AS rows FROM (
    SELECT (CASE WHEN EXTRACT(MONTH FROM "incurredAt")>=3 THEN EXTRACT(YEAR FROM "incurredAt")
                 ELSE EXTRACT(YEAR FROM "incurredAt")-1 END)::int AS fy,
           count(*) AS cnt, sum(amount) AS total
    FROM "Expense" GROUP BY 1
  ) e
),
shares AS (
  SELECT coalesce(sum(le.shares),0) AS total_outstanding
  FROM "LedgerEntry" le JOIN "Transaction" t ON t.id=le."transactionId" WHERE t.deleted=false
),
balances AS (
  SELECT jsonb_agg(jsonb_build_object('shareholderId', sid, 'name', nm, 'active', act, 'balance', bal) ORDER BY sid) AS rows FROM (
    SELECT s.id AS sid, s.name AS nm, s.active AS act, coalesce(sum(le.shares) FILTER (WHERE t.deleted=false),0) AS bal
    FROM "Shareholder" s
    LEFT JOIN "LedgerEntry" le ON le."shareholderId" = s.id
    LEFT JOIN "Transaction" t ON t.id = le."transactionId"
    GROUP BY s.id, s.name, s.active
  ) b
)
SELECT jsonb_pretty(jsonb_build_object(
  'source', 'mfr-accounting production branch br-proud-wind-a642mkzo (project nameless-fog-46521987)',
  'captured_for', 'single-app-merge Phase 0 fingerprint (reference for Phase 2 cross-check)',
  'captured_date', '2026-07-17',
  'fiscal_year_rule', 'FY = UTC month >= 3 (March) ? year : year-1; expenses bucket by incurredAt, contributions by createdAt',
  'counts', to_jsonb((SELECT counts FROM counts)),
  'transactions_by_type', (SELECT by_type FROM txn_types),
  'expenses', jsonb_build_object('count', (SELECT cnt FROM expense_totals), 'total', (SELECT total FROM expense_totals), 'by_fiscal_year', (SELECT rows FROM expense_by_fy)),
  'total_shares_outstanding', (SELECT total_outstanding FROM shares),
  'shareholder_balances', (SELECT rows FROM balances)
));
