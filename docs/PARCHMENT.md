# The pirate's torn map (the web version)

The browser version of SYPH is drawn as a pirate's torn map: aged parchment with burnt edges and fold creases, sepia ink,
deep sea blue, brass and wax red. Chats are dispatches pinned to the map, buttons are ship's planking and wax, loading is a
turning compass, and on a desktop browser window the app is a plank rail, a list of dispatches and one wide sheet of the map.

**The phone app is not touched.** Its screens, themes and app icon are exactly as they are in `main`. The map lives in files
that only a browser loads, so the two versions share one codebase without sharing a line of screen code. How is described
under [Beside the phone app](#beside-the-phone-app).

## Beside the phone app

| | Phone (Android, iOS) | Browser |
|---|---|---|
| Screens and components | `Foo.tsx` | `Foo.web.tsx`, next to it |
| Colours | `hooks/themeContext.tsx` (the themes) | `theme/mapTheme.ts`: `useTheme()` returns the one palette |
| Root layout | `app/_layout.tsx` | `app/_layout.web.tsx`: desktop shell, map typefaces, browser dialogs |

- Metro picks `Foo.web.tsx` over `Foo.tsx` in a browser and never loads it on a phone. Expo Router does the same for routes
  ([platform-specific extensions](https://docs.expo.dev/router/advanced/platform-specific-modules/)), which is why every
  `.web` file needs its phone file beside it.
- Everything that is only the map is imported by `.web` files alone: `components/parchment`, `components/desktop`,
  `components/chat/ChatListView.tsx`, `theme/colors`, `theme/parchment`, `theme/fonts`, `theme/web`, `theme/mapTheme`,
  `utils/browserAlert`, `assets/parchment`, `assets/fonts`. No phone file imports them, so a phone bundle never contains them.
- Of the files that were already in the repo, only `app.json` changes, and only inside its `web` block.
- When a phone screen changes in a way that is not just looks, make the same change in its `.web` twin. A change to
  `_layout.tsx` (a new provider, a new screen) goes into `_layout.web.tsx` too.
- `npx tsc --noEmit` checks the phone build. `npx tsc -p tsconfig.web.json --noEmit` checks the browser build: it resolves
  `.web` files first and leaves out the phone files they replace. `tests/unit/webVariants.test.ts` fails when a `.web` file has
  no phone file, or is missing from `tsconfig.web.json`.

## The pieces

Import from one place: `import { Page, Paper, Text } from '../../components/parchment';` (the code is in
`src/components/parchment/`). Colours come from `const { themeColors } = useTheme()` of `src/theme/mapTheme.ts` (the palette is `src/theme/colors.ts`), never from
`hooks/themeContext`, which belongs to the phone.

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
| `DesktopShell`, `DesktopEmpty`, `Focused` (in `components/desktop`) | The desktop layout: plank rail, list of chats, open page. Already used in `app/_layout.web.tsx`; `DesktopEmpty` is what the Chat tab shows beside the list. `Focused` wraps a tab's page and hides it while another tab is open: on a wide window the pages are transparent, so a hidden tab would show through the open one. | Nothing else needs them. |
| `paperShadow(color, lift)`, `POINTER`, `SHEET_FRAME`, `DIALOG_FRAME`, `useDesktopLayout`, `InShellContext`, `IS_WEB`, `isHovered`, `NATIVE_DRIVER`, `useReduceMotion` | Platform helpers, see [On the web](#on-the-web). | Anything custom that needs a shadow, a hand cursor or an Animated driver. |
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

1. Every web screen is a `Page`. Rows, cards, sheets and inputs are `Paper`. All text is the parchment `Text` or `TextInput`.
2. Turn only things that are looked at: list rows, empty-state cards, avatars. Never turn a `TextInput`, a scrolling list, a
   video, a map or anything a finger drags. A message slip may lean by at most half a degree (`maxTilt={0.5}`).
3. `trail` (the dashed line inside a Paper) is for panels and inputs, not for every row of a long list.
4. A dashed border needs the same width on all four sides to draw on Android. A dotted divider is `TrailLine`, not a border.
5. Shadows that need to work on the phone and the web come from `paperShadow` or from `Paper`/the buttons. A bare `elevation`
   does nothing in a browser.
6. Icons are Ionicons. The glyph name must exist in the Ionicons set.
7. Tilt, tear and shadow are for display. Do not put a `Paper` with `angle` or `seed` around something the person types into.
8. Keep the behaviour of every screen exactly as its phone twin has it. This is a re-skin: no changes to data, navigation, permissions, text a
   test depends on, or accessibility roles.
9. An Image that fills its parent is `style={FILL_IMAGE}` (from `components/parchment`), and its tint is the `tintColor` prop. React
   Native Web gives an Image the size of its file before it reads `style`, so left/right/top/bottom alone leave a torn edge
   hundreds of points wide; and spreading `StyleSheet.absoluteFill` into a new object loses its parts on the web.
10. A navigator paints its screens with the navigation theme's background, pale grey by default. `_layout.web.tsx` makes it
    transparent on a wide window so the map the shell paints shows through; keep any new navigator under that `ThemeProvider`.

## On the web

The web build is the same screens and the same pieces. What differs, and where:

| What | Where |
| --- | --- |
| From a window 900 points wide the app is the desktop layout: an 84 point plank rail (Chats, Add, Me; it replaces the tab bar), the list of chats (360 points, 320 on a window under 1100) and the open page. The empty Chats page lies on a landscape sheet of the map (`parchment-map-wide.jpg`); an open chat, Add and Me lie on the plain one (`parchment-plain-wide.jpg`), so a form is never drawn over coastlines and trails (both pictures are web build only). Narrower, it is the phone layout filling the window. | `DesktopShell` in `components/desktop`, rules in `theme/web.ts`, used by `app/_layout.web.tsx` and `app/(tabs)/_layout.web.tsx` |
| Inside the shell a `Page` is transparent and draws no picture of its own (the shell painted one for the whole pane); a modal that needs its own picture passes `force` to `PageTexture` | `InShellContext`, `Page` |
| Lines of text never stretch across a monitor: a conversation is at most 820 points wide, Add and Me 640, sign-in 520, a toast 440 | `READING_WIDTH`, `FORM_WIDTH` in `theme/web.ts` |
| No back button in a conversation (the list is right there); choosing another chat swaps the open one instead of stacking screens | `useDesktopLayout` in `app/chat/[id].tsx`, `ChatListView` |
| The page around the app: title, colours before the app loads (no white flash), the scrollbar, text selection, the keyboard focus ring, no rubber-band scrolling | `app/+html.tsx` |
| Shadows are written as CSS `boxShadow` instead of Android's `elevation` | `paperShadow` in `components/parchment/platform.ts` |
| Hand cursor and hover brightening on buttons | `POINTER`, `isHovered` |
| A `Modal` is drawn over the whole browser window, so a sheet or panel inside one is given `SHEET_FRAME` (full width up to 560 points, centred); a full-height picker (forward, GIFs, group info) is given `DIALOG_FRAME`, a card with margins and a shadow over a dimmed window; the message menu is a torn note in the middle of the window | `SHEET_FRAME`, `DIALOG_FRAME` |
| No native animation engine in a browser, so Animated must not ask for one | `NATIVE_DRIVER` |
| `Alert.alert` does nothing in React Native Web, so `app/_layout.web.tsx` points it at the browser's own `alert` / `confirm` (the logic is `utils/browserAlert.ts`: a destructive button is what `confirm` runs on OK) | `utils/browserAlert.ts` |
| A text box is `Field`: a dashed, hand-drawn box around a `TextInput`, which turns brass-red while it has focus. Enter sends a message in a browser, Shift+Enter adds a line | `Field`, `components/chat/MessageInput.tsx` |
| Tab icon and name, and the colour of the browser's address bar on phones | `web` in `app.json`, `assets/images/favicon-compass.png` |

Push notifications and live location sharing are not available in a browser; their screens look the same but the features
check for the platform as before.

Calls run on the browser's own WebRTC. `services/webrtc.web.ts` hands the call code the browser's peer connection and media
devices in the shape of react-native-webrtc's (`services/webrtcBrowser.tsx`): `RTCView` becomes a `<video>`, the other person's
voice plays through a hidden `<audio>`, and `stream.toURL()` is an address that `utils/streamRegistry.ts` turns back into the
stream. A browser allows the microphone and camera only on an https:// page or on localhost; anywhere else `getWebRTC()` is null
and the chat screen says so. When `webrtc.ts` changes (the ICE server list, say), change `webrtc.web.ts` too:
`tests/unit/streamRegistry.test.ts` checks that their exports match. The call screens are still the phone's, unstyled for the map.

To try it: `npm run web`, or `npx expo export --platform web` and serve the `dist` folder.

## Assets

Made by `scripts/make-parchment-art.py` (Python with Pillow and numpy) into `assets/parchment/`. Re-run it after changing a
colour or a drawing; the random seed is fixed so the output only changes when the script does.

| File | |
| --- | --- |
| `parchment-map.jpg`, `parchment-plain.jpg`, `night-sea.jpg` | Page backgrounds |
| `wood.jpg` | Planks: buttons, tab bar |
| `parchment-map-wide.jpg`, `parchment-plain-wide.jpg` | The same two pages in landscape, for desktop browser windows (loaded only by the web build, `wideArt.web.ts`) |
| `tear.png`, `tear-rim.png` | The ragged edge and its pale fibres (tinted at run time) |
| `seal.png`, `seal-ring.png` | Sealing wax and the groove stamped in it (tinted at run time) |
| `compass.png` | The compass rose (tinted at run time) |
| `../images/favicon-compass.png` | Browser tab icon |

Typefaces, in `assets/fonts/` with their licences in `assets/fonts/licenses/` (all SIL Open Font License): Pirata One, Crimson
Text, IM Fell English SC, IM Fell English. They are subset to Latin, Latin Extended, punctuation, arrows and the rupee sign.

## Where things are

```
src/theme/colors.ts        the palette
src/theme/mapTheme.ts      useTheme() for the .web files: returns the one palette
src/theme/parchment.ts     fonts, tilt, shadows, colour helpers (tested)
src/theme/fonts.ts         the font files and loading them
src/theme/web.ts           how the app sits in a browser window (tested)
src/components/parchment/  the pieces above
src/components/desktop/    the rail, list and map page around the screens on a wide window
src/app/**/*.web.tsx       the browser's screens, each beside the phone's
src/app/+html.tsx          the page around the app on the web
scripts/make-parchment-art.py
tsconfig.web.json          type-check of the browser build
tests/unit/colors.test.ts, parchment.test.ts, web.test.ts, browserAlert.test.ts, webVariants.test.ts
```
