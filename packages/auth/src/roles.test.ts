import { describe, it, expect } from 'vitest'
import {
  NO_ROLES,
  mapRolesRow,
  canManageUsers,
  canManagePortalContent,
  canAdminReservations,
  canAdminAccounting,
  type UserRoles,
} from './roles'

const roles = (over: Partial<UserRoles> = {}): UserRoles => ({ ...NO_ROLES, ...over })

describe('mapRolesRow', () => {
  it('returns NO_ROLES for a missing row', () => {
    expect(mapRolesRow(undefined)).toEqual(NO_ROLES)
  })

  it('maps snake_case columns to camelCase flags', () => {
    expect(
      mapRolesRow({ is_site_owner: false, is_site_manager: true, is_accounting_manager: true }),
    ).toEqual({ siteOwner: false, siteManager: true, accountingManager: true })
  })
})

describe('capabilities', () => {
  it('user management is owner-only', () => {
    expect(canManageUsers(roles({ siteOwner: true }))).toBe(true)
    expect(canManageUsers(roles({ siteManager: true }))).toBe(false)
    expect(canManageUsers(roles({ accountingManager: true }))).toBe(false)
  })

  it('portal content admin is owner or manager', () => {
    expect(canManagePortalContent(roles({ siteOwner: true }))).toBe(true)
    expect(canManagePortalContent(roles({ siteManager: true }))).toBe(true)
    expect(canManagePortalContent(roles({ accountingManager: true }))).toBe(false)
    expect(canManagePortalContent(NO_ROLES)).toBe(false)
  })

  it('reservations admin is owner or manager', () => {
    expect(canAdminReservations(roles({ siteManager: true }))).toBe(true)
    expect(canAdminReservations(roles({ siteOwner: true }))).toBe(true)
    expect(canAdminReservations(roles({ accountingManager: true }))).toBe(false)
  })

  it('accounting admin is owner or accounting manager (not plain site manager)', () => {
    expect(canAdminAccounting(roles({ accountingManager: true }))).toBe(true)
    expect(canAdminAccounting(roles({ siteOwner: true }))).toBe(true)
    expect(canAdminAccounting(roles({ siteManager: true }))).toBe(false)
  })
})
