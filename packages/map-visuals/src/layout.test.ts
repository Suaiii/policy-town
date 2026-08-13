import { describe, expect, it } from 'vitest'
import { ARCHETYPE_RECIPES, ARCHETYPE_ROLE_VARIANTS, MAP_ASSET_CATALOG } from './assetCatalog'
import { HEFEI_PARCEL_SLOTS } from './hefeiLayout'

describe('logical industrial map layout', () => {
  it('groups nine stable parcels into named Hefei industrial corridors', () => {
    expect(HEFEI_PARCEL_SLOTS).toHaveLength(9)
    expect(new Set(HEFEI_PARCEL_SLOTS.map((slot) => slot.id)).size).toBe(9)
    expect(HEFEI_PARCEL_SLOTS.filter((slot) => slot.id.startsWith('gaoxin-'))).toHaveLength(2)
    expect(HEFEI_PARCEL_SLOTS.filter((slot) => slot.id.startsWith('xinzhan-'))).toHaveLength(3)
    expect(HEFEI_PARCEL_SLOTS.filter((slot) => slot.id.startsWith('jingkai-'))).toHaveLength(2)
    expect(HEFEI_PARCEL_SLOTS.filter((slot) => slot.id.startsWith('binhu-'))).toHaveLength(2)
  })

  it('assigns one distinct, role-correct model to every campus function', () => {
    const expectedRoles = ['main', 'support', 'warehouse', 'utility']
    for (const recipe of Object.values(ARCHETYPE_RECIPES)) {
      expect(recipe).toHaveLength(4)
      expect(new Set(recipe).size).toBe(4)
      expect(recipe.map((assetId) => MAP_ASSET_CATALOG[assetId].role)).toEqual(expectedRoles)
    }
  })

  it('provides multiple stable model choices for every archetype and campus role', () => {
    for (const variantsByRole of Object.values(ARCHETYPE_ROLE_VARIANTS)) {
      for (const [role, variants] of Object.entries(variantsByRole)) {
        expect(variants.length).toBeGreaterThanOrEqual(3)
        expect(new Set(variants).size).toBe(variants.length)
        expect(variants.every((assetId) => MAP_ASSET_CATALOG[assetId].role === role)).toBe(true)
      }
    }
  })
})
