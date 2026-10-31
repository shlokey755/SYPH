/**
 * youtubePlayer.ts
 * Pure helpers for playing a YouTube video or Short inside the app: the small web page that holds YouTube's own
 * embedded player, how that page reports back, and the pop-up sizes. No React or native code, so it is unit-tested.
 *
 * Why a page with a made-up origin: YouTube's embedded player now refuses to play (error 153, "video player
 * configuration error") unless the page that holds it identifies itself with an HTTP referrer. A WebView showing local
 * HTML has none, so the page is loaded with PLAYER_ORIGIN, the app's package name written as a URL, which is what
 * YouTube's embed rules ask mobile apps to send.
 */

/** The app's Android package name (`app.json`) as an https origin. */
export const PLAYER_ORIGIN = 'https://com.syph.chat';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * The page the pop-up loads. `id` is checked against YouTube's 11-character format first, so nothing else can reach
 * the markup; returns null for anything else. Fullscreen is switched off (`fs=0`, no `allowfullscreen`) because a
 * fullscreen video cannot be shown from inside an Android Modal; the pop-up is sized to fill the screen width instead.
 */
export function buildPlayerHtml(id: string): string | null {
  if (!VIDEO_ID.test(id)) return null;
  const src =
    `https://www.youtube-nocookie.com/embed/${id}` +
    `?enablejsapi=1&playsinline=1&autoplay=1&rel=0&fs=0&origin=${encodeURIComponent(PLAYER_ORIGIN)}`;
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{position:absolute;top:0;left:0;right:0;bottom:0;width:100%;height:100%;border:0}</style>
</head><body>
<iframe id="player" src="${src}" allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin"></iframe>
<script>
function send(message){try{window.ReactNativeWebView.postMessage(JSON.stringify(message));}catch(e){}}
var api=document.createElement('script');
api.src='https://www.youtube.com/iframe_api';
api.onerror=function(){send({type:'error',code:-1});};
document.head.appendChild(api);
window.onYouTubeIframeAPIReady=function(){
  new YT.Player('player',{events:{
    onReady:function(){send({type:'ready'});},
    onError:function(e){send({type:'error',code:e.data});}
  }});
};
</script>
</body></html>`;
}

export type PlayerMessage = { type: 'ready' } | { type: 'error'; code: number };

/** Reads what the player page posts back (a JSON string). Returns null for anything that is not one of the two. */
export function parsePlayerMessage(raw: unknown): PlayerMessage | null {
  if (typeof raw !== 'string') return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const message = data as Record<string, unknown>;
  if (message.type === 'ready') return { type: 'ready' };
  if (message.type === 'error' && typeof message.code === 'number') return { type: 'error', code: message.code };
  return null;
}

/** What to tell the person when the player reports an error. `code` is YouTube's player error code; -1 is "script did not load". */
export function playerErrorText(code: number): string {
  switch (code) {
    case 100:
      return 'This video was removed or made private.';
    case 101:
    case 150:
      return 'The owner does not allow this video to be played in other apps.';
    case 153:
      return 'YouTube would not start the player here.';
    case -1:
      return 'The player could not load. Check your connection.';
    default:
      return 'This video cannot be played here.';
  }
}

export const PLAYER_TIMEOUT_TEXT = 'The player is taking too long. Check your connection.';

const YOUTUBE_URL = /^https?:\/\/(?:[\w-]+\.)*(?:youtube\.com|youtu\.be|youtube-nocookie\.com)(?:[/?#:]|$)/i;

export const isYouTubeUrl = (url: string): boolean => YOUTUBE_URL.test(url);

/** The player page itself (and the blank page a WebView starts on) may load; every other page change is blocked. */
export const isPlayerPage = (url: string): boolean =>
  url === 'about:blank' || url === PLAYER_ORIGIN || url.startsWith(`${PLAYER_ORIGIN}/`);

export interface PlayerSize {
  width: number;
  height: number;
}

/**
 * Pop-up player size for a screen. A video is 16:9 and as wide as the screen allows (up to 640); a Short is 9:16 and
 * as tall as fits, never taller than 62% of the screen, and never wider than the screen.
 */
export function playerSize(isShort: boolean, windowWidth: number, windowHeight: number): PlayerSize {
  const maxWidth = Math.max(160, Math.min(640, windowWidth - 24));
  if (!isShort) return { width: Math.round(maxWidth), height: Math.round((maxWidth * 9) / 16) };
  const height = Math.min(windowHeight * 0.62, (maxWidth * 16) / 9, 640);
  return { width: Math.round((height * 9) / 16), height: Math.round(height) };
}
