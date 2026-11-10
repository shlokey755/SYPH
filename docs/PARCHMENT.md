# The pirate's torn map

SYPH has one look: a pirate's torn map. Aged parchment with burnt edges and fold creases, sepia ink, deep sea blue, brass and
wax red. Chats are dispatches pinned to the map, buttons are ship's planking and wax, loading is a turning compass, and on a
wide browser window the whole map lies on a dark ship's table.

There is no theme picker and no choice of app icon. One look, on the phone and on the web, from one set of pieces.

Everything is JavaScript and bundled assets, so a new look reaches installed apps through an over-the-air update. The few
things that are not covered are listed under [Not covered by an update](#not-covered-by-an-update).

## The pieces

Import from one place: `import { Page, Paper, Text } from '../../components/parchment';` (the code is in
`src/components/parchment/`). Colours come from `const { themeColors } = useTheme()` (`src/theme/colors.ts`).

| Piece | What it is | Use it for |
| --- | --- | --- |
| `Page` | The map behind a screen. `variant="map"` the full chart with islands (main screens, sign-in), `"plain"` parchment with nothing drawn on it (chats, long reading), `"night"` a dark sea chart (calls, media). | The root of every screen. |
| `Paper` | A scrap of the map pinned to the page. `tone` `paper`/`alt`/`accent`/`night`, `seed` or `angle` to turn it a little, `trail` for a dashed route line inside the edge, `torn` `top`/`bottom`/`both` for ragged edges, `pin` `tack`/`nails`/`seal`, `lift` 0 to 3 for shadow, `radius`. `contentStyle` styles the paper itself (padding, row layout); `style` the outside (margin, width). | Cards, list rows, message slips, panels, sheets, inputs. |
| `Text`, `TextInput` | Replace react-native's. `kind` `body` (default), `display`, `label`, `hand`. | All text. |
| `Avatar` | A round brass medallion with the initial in blackletter, or a photo (`uri`), or an `icon`. | People and groups. |
| `MapButton` | `variant` `plank` (ship's plank, the default), `wax` (red wax, the one thing the screen is about), `danger` (dark red wax: delete, leave, hang up), `ghost` (dashed trail, no fill: the quiet second choice). `icon`, `loading`, `disabled`, `small`. | Buttons with words. |
| `RoundButton` | A brass medallion with an icon. `tone` `paper`/`wax`/`wood`/`sea`/`night`, `active` for a lit toggle. Draw the icon in `roundLook(themeColors, tone, active).ink`. | Send, call controls, close, toggles. |
| `Stamp` | A rubber stamp: small capitals in a double frame. | NEW, MUTED, PINNED. |
| `CountSeal` | A red wax seal with a number. Draws nothing for 0. | Unread counts. |
| `Tack`, `WaxSeal` | The brass tack and the blob of wax, to place yourself. | Rarely directly: `Paper pin` covers most uses. |
| `TrailLine` | A dotted trail across the page, `x` for an X at the end. | One or two dividers per screen. Not inside long lists. |
| `PageTitle` | The screen's name in blackletter, `note` in handwriting under it, `right` for a button. | Top of a main screen. |
| `HeroTitle` | A large centred title with a trail and a note. `night` for use over the night sea. | Sign-in, onboarding, call screens. |
| `Note` | A line of quill handwriting. `onPaper` for use on a Paper. | Captions, hints. |
| `Banner` | A ribbon with a word on it. `tone` `wax`/`sea`/`brass`/`paper`. | Date separators, section headings. |
| `Loading`, `Compass` | A turning compass. `Loading` has an optional `label`. | Everywhere a spinner would go. Do not use `ActivityIndicator`. |
| `Unfurl` | Rolls its content open like a scroll (`from="top"` or `"bottom"`), once, when it first shows. Does nothing under "reduce motion". | Toasts, sheets, panels that arrive on top of a screen. |
| `WebFrame` | Puts the app on the ship's table in a wide browser window. Already used in `app/_layout.tsx`. | Nothing else needs it. |
| `paperShadow(color, lift)`, `POINTER`, `SHEET_FRAME`, `IS_WEB`, `isHovered`, `NATIVE_DRIVER`, `useReduceMotion` | Platform helpers, see [On the web](#on-the-web). | Anything custom that needs a shadow, a hand cursor or an Animated driver. |
| `ART` | The pictures (`wood`, `tear`, `compass`, ...). | `ART.wood` for a plank background. |

`toneLook(themeColors, tone)` gives `{ background, ink, inkSoft, stamp }` for a Paper tone: use `ink` and `inkSoft` for text on it.

### Typefaces

| `kind` | Face | For | Size to start from |
| --- | --- | --- | --- |
| `body` | Crimson Text (regular, bold, italic, bold italic) | Everything that is read, message text | 15 to 17 |
| `display` | Pirata One | Headlines, names, big numbers | 20 and up. It is narrow; it needs size. |
| `label` | IM Fell English SC | Button captions, tags, small labels. Lower case comes out as small capitals. | 12 to 17 |
| `hand` | IM Fell English Italic | Notes in the margin, times, hints | 17 to 20 |

Only `body` has bold and italic. `fontWeight: '700'` and `fontStyle: 'italic'` on a `body` Text pick the right file; on the other
kinds they are ignored. Never write `fontFamily` by hand (the one exception is `tabBarLabelStyle`, which takes `FONT.label`).

### Colours

On the page itself use `text`, `subText`, `accent`, `danger`. On a Paper use `ink`, `inkSoft`, `stamp` (wax red, for highlights
and links). On `accent` (sea blue) or red wax use `buttonText`. On the night sea use `nightInk`, `nightSoft`, `gilt` (polished
gold). Decoration: `brass`, `pins`, `wood`, `trail`, `shadow`, `burn`. All pairs that can meet are contrast-checked in
`tests/unit/colors.test.ts`; do not invent colours.

Do not hard-code colours. The only exceptions: the black and white of video overlays, and scrims, which are warm brown
`rgba(51, 38, 27, 0.55)` and never pure black.

## Behaviour

The look is also how things move and what they say.

- **Pressing sinks.** Buttons and round buttons move down a couple of points and darken when pressed; on the web they brighten
  under the mouse and show a hand cursor. List rows: `opacity` 0.85 and a 1 point shift, as in the chat list.
- **Things arrive by unrolling.** Toasts, sheets and floating panels use `Unfurl`. Screens use the stack's own animation.
- **Waiting is a compass.** `Loading` (with a handwritten label such as "Charting the course...") replaces every spinner.
- **Unread things are tacked up and sealed.** An unread dispatch gets `pin="tack"` and a `CountSeal`.
- **Reduce motion is respected**: `Unfurl` just appears, and nothing else new loops except `Loading`.

### Voice

Flavour goes in the places that are decoration anyway: the handwritten note under a title, empty states, toasts, the caption on
a button, loading labels. Meaning always stays obvious. Never rename something a person has to find.

- Keep plain: tab names (Chat, Me, Add), settings names, permission text, error reasons, anything with a number or a time.
- Add flavour: "all quiet on deck" (nothing unread), "No chats on the horizon" (empty list), "Charting the course..."
  (loading), "Message sent" becomes "Sent to the crew", "Copied" becomes "Copied to your log". One flourish per screen is
  plenty; a pun in every string is tiring.
- Accessibility labels say what the thing does in plain words, whatever it is drawn as.

## Rules

1. Every screen is a `Page`. Rows, cards, sheets and inputs are `Paper`. All text is the parchment `Text` or `TextInput`.
2. Turn only things that are looked at: list rows, empty-state cards, avatars. Never turn a `TextInput`, a scrolling list, a
   video, a map or anything a finger drags. A message slip may lean by at most half a degree (`maxTilt={0.5}`).
3. `trail` (the dashed line inside a Paper) is for panels and inputs, not for every row of a long list.
4. A dashed border needs the same width on all four sides to draw on Android. A dotted divider is `TrailLine`, not a border.
5. Shadows that need to work on the phone and the web come from `paperShadow` or from `Paper`/the buttons. A bare `elevation`
   does nothing in a browser.
6. Icons are Ionicons. The glyph name must exist in the Ionicons set.
7. Tilt, tear and shadow are for display. Do not put a `Paper` with `angle` or `seed` around something the person types into.
8. Keep the behaviour of every screen exactly as it was. This is a re-skin: no changes to data, navigation, permissions, text a
   test depends on, or accessibility roles.

## On the web

The web build is the same screens and the same pieces. What differs, and where:

| What | Where |
| --- | --- |
| On a window 720 points wide or more the app becomes a 480 point column of map on a dark ship's table (`desk.jpg`), with two tacks at the top. Below that it fills the window like on a phone. | `WebFrame` in `components/parchment`, rules in `theme/web.ts`, used by `app/_layout.tsx` |
| The page around the app: title, colours before the app loads (no white flash), the scrollbar, text selection, the keyboard focus ring, no rubber-band scrolling | `app/+html.tsx` |
| Shadows are written as CSS `boxShadow` instead of Android's `elevation` | `paperShadow` in `components/parchment/platform.ts` |
| Hand cursor and hover brightening on buttons | `POINTER`, `isHovered` |
| A `Modal` is drawn over the whole browser window, not over the map column, so a sheet or panel inside one is given `SHEET_FRAME` (full width up to the column width, centred) | `SHEET_FRAME` |
| No native animation engine in a browser, so Animated must not ask for one | `NATIVE_DRIVER` |
| `Alert.alert` does nothing in React Native Web, so `app/_layout.tsx` points it at the browser's own `alert` / `confirm` (the logic is `utils/browserAlert.ts`: a destructive button is what `confirm` runs on OK) | `utils/browserAlert.ts` |
| A text box is `Field`: a dashed, hand-drawn box around a `TextInput`, which turns brass-red while it has focus. Enter sends a message in a browser, Shift+Enter adds a line | `Field`, `components/chat/MessageInput.tsx` |
| Tab icon and name, and the colour of the browser's address bar on phones | `web` in `app.json`, `assets/images/favicon-compass.png` |

Calls, push notifications and live location sharing are not available in a browser; their screens look the same but the
features check for the platform as before.

To try it: `npm run web`, or `npx expo export --platform web` and serve the `dist` folder.

## Assets

Made by `scripts/make-parchment-art.py` (Python with Pillow and numpy) into `assets/parchment/`. Re-run it after changing a
colour or a drawing; the random seed is fixed so the output only changes when the script does.

| File | |
| --- | --- |
| `parchment-map.jpg`, `parchment-plain.jpg`, `night-sea.jpg` | Page backgrounds |
| `wood.jpg` | Planks: buttons, tab bar |
| `desk.jpg` | The ship's table (web, wide windows) |
| `tear.png`, `tear-rim.png` | The ragged edge and its pale fibres (tinted at run time) |
| `seal.png`, `seal-ring.png` | Sealing wax and the groove stamped in it (tinted at run time) |
| `compass.png` | The compass rose (tinted at run time) |
| `../images/favicon-compass.png` | Browser tab icon |

Typefaces, in `assets/fonts/` with their licences in `assets/fonts/licenses/` (all SIL Open Font License): Pirata One, Crimson
Text, IM Fell English SC, IM Fell English. They are subset to Latin, Latin Extended, punctuation, arrows and the rupee sign.

## Not covered by an update

These are part of the installed app, so they change only with a new build:

- The launcher icon, adaptive icon and splash image (still black with the old logo): `app.json` and `assets/images`.
- The colour of the Android notification accent and the location-service notification.
- The status bar and navigation bar tints the system draws before the first screen.

Everything on screen after the first frame, and everything in the browser, follows the map.

## Where things are

```
src/theme/colors.ts        the palette (one look)
src/theme/parchment.ts     fonts, tilt, shadows, colour helpers (tested)
src/theme/fonts.ts         the font files and loading them
src/theme/web.ts           how the app sits in a browser window (tested)
src/components/parchment/  the pieces above
src/hooks/themeContext.tsx useTheme(): returns the one palette
src/app/+html.tsx          the page around the app on the web
scripts/make-parchment-art.py
tests/unit/colors.test.ts, parchment.test.ts, web.test.ts
```
