/**
 * tileGrid.ts
 * How the tiles of a group call lie in a window: how many columns and rows, and how big each tile is. The phone's grid
 * (utils/groupCall.ts, gridLayout) is made for a tall screen, where two people stack. A browser window is usually wider than it is
 * tall, so there the answer depends on the shape of the space.
 * No React, so plain Node can test it (tests/unit/tileGrid.test.ts).
 */

export interface TileGrid {
  columns: number;
  rows: number;
  /** The size of one tile, whole points, in the shape asked for. 0 while the space has not been measured. */
  width: number;
  height: number;
}

/**
 * The columns and rows that give the biggest tiles of one shape (width ÷ height, 4:3 unless told otherwise) inside `width` ×
 * `height`. Fewer columns win a tie, and a last row with fewer tiles is fine: the caller centres it.
 */
export function bestGrid(count: number, width: number, height: number, shape = 4 / 3): TileGrid {
  const tiles = Math.max(1, Math.floor(count) || 1);
  if (!(width > 0) || !(height > 0)) return { columns: 1, rows: tiles, width: 0, height: 0 };

  let best: TileGrid = { columns: 1, rows: tiles, width: 0, height: 0 };
  let bestArea = -1;
  for (let columns = 1; columns <= tiles; columns++) {
    const rows = Math.ceil(tiles / columns);
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    // The biggest picture of the wanted shape that fits in a cell.
    const tileWidth = Math.min(cellWidth, cellHeight * shape);
    const tileHeight = tileWidth / shape;
    const area = tileWidth * tileHeight;
    if (area > bestArea + 1e-9) {
      bestArea = area;
      best = { columns, rows, width: Math.floor(tileWidth), height: Math.floor(tileHeight) };
    }
  }
  return best;
}
