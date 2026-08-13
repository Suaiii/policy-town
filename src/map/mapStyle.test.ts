import { describe, expect, it } from 'vitest'
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import { HEFEI_MAP_STYLE } from './mapStyle'

describe('offline Hefei map style', () => {
  it('is valid and contains every local geography layer', () => {
    const errors = validateStyleMin(HEFEI_MAP_STYLE)
    expect(errors.map((error) => error.message)).toEqual([])
    expect(Object.keys(HEFEI_MAP_STYLE.sources)).toHaveLength(7)
    expect(HEFEI_MAP_STYLE.layers.map((layer) => layer.id)).toContain('chao-lake-fill')
    expect(HEFEI_MAP_STYLE.layers.map((layer) => layer.id)).toContain('urban-blocks')
  })
})
