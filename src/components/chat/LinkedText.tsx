/**
 * LinkedText.tsx
 * The text of a chat message with its web links made tappable (underlined, read out as "link" by screen readers).
 * Which words are links is decided by utils/linkify.ts. A tap opens the link like this:
 *   - a YouTube video or Short plays in the in-app pop-up (VideoPlayerModal), which can hand over to YouTube itself;
 *   - any other link opens in the phone's browser (or the app that handles that address, such as Maps or Instagram);
 *   - if the phone cannot open it, a toast says so, with the address.
 * Long-pressing a link still opens the message menu, like long-pressing the rest of the bubble. A message without a link is
 * drawn as one plain Text, exactly as before, and needs no theme or toast.
 */

import React, { memo, useMemo, useState } from 'react';
import { Linking, StyleProp, StyleSheet, Text, TextStyle } from 'react-native';
import { useTheme } from '../../hooks/themeContext';
import { useToast } from '../../hooks/toastNotifications';
import { extractYouTube, YouTubeLink } from '../../utils/linkPreview';
import { splitLinks, TextPart } from '../../utils/linkify';
import { VideoPlayerModal } from './VideoPlayerModal';

interface Props {
  text: string;
  style: StyleProp<TextStyle>;
  onLongPress?: () => void;
}

interface PartsProps {
  parts: TextPart[];
  style: StyleProp<TextStyle>;
  onLongPress?: () => void;
}

function LinkedParts({ parts, style, onLongPress }: PartsProps) {
  const { themeColors } = useTheme();
  const toast = useToast();
  const [playing, setPlaying] = useState<YouTubeLink | null>(null);

  const open = (url: string) => {
    const video = extractYouTube(url);
    if (video) {
      setPlaying(video);
      return;
    }
    Linking.openURL(url).catch(() => toast.error('Could not open the link', url));
  };

  return (
    <>
      <Text style={style}>
        {parts.map((part, index) =>
          part.url ? (
            <Text
              key={index}
              style={styles.link}
              accessibilityRole="link"
              onPress={() => open(part.url as string)}
              onLongPress={onLongPress}
            >
              {part.text}
            </Text>
          ) : (
            part.text
          )
        )}
      </Text>
      {playing && <VideoPlayerModal link={playing} colors={themeColors} onClose={() => setPlaying(null)} />}
    </>
  );
}

function LinkedTextBase({ text, style, onLongPress }: Props) {
  const parts = useMemo(() => splitLinks(text), [text]);
  if (!parts.some((part) => part.url)) return <Text style={style}>{text}</Text>;
  return <LinkedParts parts={parts} style={style} onLongPress={onLongPress} />;
}

export const LinkedText = memo(LinkedTextBase);

const styles = StyleSheet.create({
  // Same colour as the rest of the message (it already reads well on its bubble), underlined so it looks tappable.
  link: { textDecorationLine: 'underline' },
});
