/**
 * art.ts
 * The pictures the map is drawn with. They are made by scripts/make-parchment-art.py and live in assets/parchment/.
 * Always `require` them from here, so every piece shares one copy.
 */

export const ART = {
  /** Parchment with burnt edges, folds and an inked map. Behind the main screens. */
  map: require('../../../assets/parchment/parchment-map.jpg'),
  /** The same parchment with nothing drawn on it. Behind chats and sheets, where text must stay easy to read. */
  plain: require('../../../assets/parchment/parchment-plain.jpg'),
  /** A dark sea chart. Behind calls. */
  night: require('../../../assets/parchment/night-sea.jpg'),
  /** Ship's planking: plank buttons and the tab bar. */
  wood: require('../../../assets/parchment/wood.jpg'),
  /** A ship's table, behind the map on wide browser windows. */
  desk: require('../../../assets/parchment/desk.jpg'),
  /** The ragged edge of torn paper, and the pale fibres along it. Black with transparency: tint them. */
  tear: require('../../../assets/parchment/tear.png'),
  tearRim: require('../../../assets/parchment/tear-rim.png'),
  /** A compass rose. Black with transparency: tint it. */
  compass: require('../../../assets/parchment/compass.png'),
  /** Sealing wax and the groove stamped into it. Tint them red, and darker red. */
  seal: require('../../../assets/parchment/seal.png'),
  sealRing: require('../../../assets/parchment/seal-ring.png'),
} as const;
