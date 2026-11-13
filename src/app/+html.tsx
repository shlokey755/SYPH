// src/app/+html.tsx
// The page around the app in a web browser (expo-router static rendering, SDK 57 form: no document context yet).
// It runs only in Node during `expo export`, never on the phone, and cannot use the DOM. The tab title, the tab icon and the
// browser's address-bar colour come from `web` in app.json.
import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

// The colours here are the vintage palette (src/theme/colors.ts) written out, because this file cannot import app code that
// pulls in React Native. If a colour there changes, change it here too.
const PAGE_CSS = `
html, body { background: #14232E; color-scheme: light; }
body { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; overscroll-behavior: none; -webkit-tap-highlight-color: transparent; }
::selection { background: #8F2619; color: #F6EBC9; }
* { scrollbar-width: thin; scrollbar-color: #8A6A2C rgba(42, 25, 11, 0.18); }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: rgba(42, 25, 11, 0.18); }
::-webkit-scrollbar-thumb { background: #8A6A2C; border-radius: 6px; border: 2px solid transparent; background-clip: padding-box; }
[tabindex]:focus-visible, input:focus-visible, textarea:focus-visible, a:focus-visible {
  outline: 2px dashed #33200F; outline-offset: 3px; box-shadow: 0 0 0 5px rgba(243, 229, 189, 0.85);
}
noscript { display: block; padding: 48px 24px; text-align: center; color: #EBD9AE; font: 20px/1.4 Georgia, serif; }
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <meta name="theme-color" content="#14232E" />
        {/* Disables body scrolling so ScrollView and FlatList behave like they do on the phone. */}
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
      </head>
      <body>
        {children}
        <noscript>This map needs JavaScript to unroll. Switch it on and come back, matey.</noscript>
      </body>
    </html>
  );
}
