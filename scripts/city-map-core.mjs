const FLIP_HORIZONTAL = 0x80000000;
const FLIP_VERTICAL = 0x40000000;
const FLIP_DIAGONAL = 0x20000000;
const ROTATE_HEX_120 = 0x10000000;
const ALL_FLAGS = FLIP_HORIZONTAL | FLIP_VERTICAL | FLIP_DIAGONAL | ROTATE_HEX_120;

export function decodeGid(value, firstGid = 1) {
  const unsigned = value >>> 0;
  const gid = (unsigned & ~ALL_FLAGS) >>> 0;
  return {
    gid,
    tileId: gid === 0 ? -1 : gid - firstGid,
    flipHorizontal: Boolean(unsigned & FLIP_HORIZONTAL),
    flipVertical: Boolean(unsigned & FLIP_VERTICAL),
    flipDiagonal: Boolean(unsigned & FLIP_DIAGONAL),
    rotateHex120: Boolean(unsigned & ROTATE_HEX_120),
  };
}

export function mergeTemplateObject(template, instance, instanceProperties = {}) {
  return {
    ...template,
    ...instance,
    width: instance.width || template.width || 0,
    height: instance.height || template.height || 0,
    properties: { ...(template.properties ?? {}), ...instanceProperties },
  };
}

export function absolutePolyline(object) {
  return (object.polyline ?? []).map((point) => ({ x: object.x + point.x, y: object.y + point.y }));
}

export function rasterizeRects(rects, width, height, tileSize, collisionTile = 4) {
  const grid = Array.from({ length: height }, () => Array(width).fill(-1));
  for (const rect of rects) {
    for (let row = Math.max(0, Math.floor(rect.y / tileSize)); row < Math.min(height, Math.ceil((rect.y + rect.height) / tileSize)); row += 1) {
      for (let col = Math.max(0, Math.floor(rect.x / tileSize)); col < Math.min(width, Math.ceil((rect.x + rect.width) / tileSize)); col += 1) {
        grid[row][col] = collisionTile;
      }
    }
  }
  return grid;
}

export function stableSerialize(value) {
  const sort = (item) => Array.isArray(item)
    ? item.map(sort)
    : item && typeof item === 'object'
      ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, sort(item[key])]))
      : item;
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}
