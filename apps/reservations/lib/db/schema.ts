import { pgTable, uuid, text, timestamp, date, jsonb, integer, pgEnum } from 'drizzle-orm/pg-core'

export const reservationStatusEnum = pgEnum('reservation_status', ['confirmed', 'cancelled'])

// users/accounts/sessions/verification_tokens live in the shared identity
// database (see @mfr/auth) — the columns below reference users.id logically,
// not via a real FK, since Postgres has no cross-database foreign keys.

export const reservations = pgTable('reservations', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  startDate: date('start_date', { mode: 'string' }).notNull(),
  endDate: date('end_date', { mode: 'string' }).notNull(),
  status: reservationStatusEnum('status').notNull().default('confirmed'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  cancelledAt: timestamp('cancelled_at'),
  reminderSentAt: timestamp('reminder_sent_at'),
})

export const blockedDates = pgTable('blocked_dates', {
  id: uuid('id').defaultRandom().primaryKey(),
  startDate: date('start_date', { mode: 'string' }).notNull(),
  endDate: date('end_date', { mode: 'string' }).notNull(),
  reason: text('reason'),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const bookingRules = pgTable('booking_rules', {
  id: integer('id').primaryKey().default(1),
  bookingHorizonDate: date('booking_horizon_date', { mode: 'string' }).notNull(),
  maxConsecutiveNights: integer('max_consecutive_nights').notNull(),
  maxNightsPerUserPerYear: integer('max_nights_per_user_per_year').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  updatedBy: uuid('updated_by'),
})

export const activityLog = pgTable('activity_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventType: text('event_type').notNull(),
  actorUserId: uuid('actor_user_id'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})
