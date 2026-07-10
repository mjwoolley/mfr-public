import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  pgEnum,
  primaryKey,
} from 'drizzle-orm/pg-core'

export const userStatusEnum = pgEnum('user_status', ['pending', 'approved', 'blocked'])

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  googleSub: text('google_sub').unique(),
  email: text('email').notNull().unique(),
  name: text('name'),
  image: text('image'),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  status: userStatusEnum('status').notNull().default('pending'),
  isReservationsAdmin: boolean('is_reservations_admin').notNull().default(false),
  isAccountingAdmin: boolean('is_accounting_admin').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const accounts = pgTable(
  'accounts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (table) => [primaryKey({ columns: [table.provider, table.providerAccountId] })]
)

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
})

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })]
)
