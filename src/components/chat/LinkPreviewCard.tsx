/**
 * LinkPreviewCard.tsx
 * A card under a text message that contains a YouTube or YouTube Shorts link: thumbnail, title and channel while the
 * video exists, and a muted "Video unavailable" card once it is gone. Tapping a card with a preview plays the video in
 * an in-app pop-up (VideoPlayerModal); a video that cannot be previewed opens YouTube (app or browser) instead.
 * Long-press is passed through so the message menu still works on the card.
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { memo, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ThemeColors } from '../../hooks/themeContext';
import { useLinkPreview } from '../../hooks/useLinkPreview';
import { extractYouTube, YouTubeLink } from '../../utils/linkPreview';
import { VideoPlayerModal } from './VideoPlayerModal';

interface Props {
  text: string;
  isMine: boolean;
  colors: ThemeColors;
  onLongPress: () => void;
}

const CARD_WIDTH = 230;
const THUMB_HEIGHT = 130;

type NoteIcon = 'videocam-off-outline' | 'logo-youtube' | 'cloud-offline-outline';

function Note({
  icon,
  title,
  sub,
  textColor,
  subColor,
}: {
  icon: NoteIcon;
  title: string;
  sub: string;
  textColor: string;
  subColor: string;
}) {
  return (
    <View style={styles.note}>
      <View style={styles.noteIcon}>
        <Ionicons name={icon} size={22} color={subColor} />
      </View>
      <View style={styles.noteText}>
        <Text style={[styles.noteTitle, { color: textColor }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.author, { color: subColor }]} numberOfLines={2}>
          {sub}
        </Text>
      </View>
    </View>
  );
}

function LinkPreviewCardBase({ text, isMine, colors, onLongPress }: Props) {
  const link: YouTubeLink | null = useMemo(() => extractYouTube(text), [text]);
  const preview = useLinkPreview(link);
  const [playing, setPlaying] = useState(false);
  if (!link) return null;

  const textColor = isMine ? colors.buttonText : colors.text;
  const subColor = isMine ? colors.buttonText : colors.subText;
  const background = isMine ? 'rgba(0,0,0,0.15)' : colors.inputBg;
  const openYouTube = () => {
    Linking.openURL(link.openUrl).catch(() => {});
  };
  // A video with a good preview plays right here; one that cannot be previewed goes to YouTube itself.
  const open = preview.state === 'ok' ? () => setPlaying(true) : openYouTube;
  // A video that is gone has nothing to open, so the card stops being a button (long-press still works).
  const gone = preview.state === 'unavailable';

  let body: React.ReactNode;
  switch (preview.state) {
    case 'loading':
      body = (
        <>
          <View style={[styles.thumb, styles.thumbLoading]}>
            <ActivityIndicator color={subColor} />
          </View>
          <View style={styles.info}>
            <View style={[styles.bar, { width: '90%', backgroundColor: subColor }]} />
            <View style={[styles.bar, { width: '55%', backgroundColor: subColor }]} />
          </View>
        </>
      );
      break;

    case 'ok':
      body = (
        <>
          <View style={styles.thumb}>
            <Image source={{ uri: preview.thumbnail }} style={styles.thumbImage} contentFit="cover" transition={150} />
            <View style={styles.play}>
              <Ionicons name="play" size={20} color="#FFFFFF" />
            </View>
            <View style={styles.badge}>
              <Ionicons name="logo-youtube" size={14} color="#FF0000" />
              <Text style={styles.badgeText}>{link.kind === 'short' ? 'Short' : 'YouTube'}</Text>
            </View>
          </View>
          <View style={styles.info}>
            <Text style={[styles.title, { color: textColor }]} numberOfLines={2}>
              {preview.title}
            </Text>
            {!!preview.author && (
              <Text style={[styles.author, { color: subColor }]} numberOfLines={1}>
                {preview.author}
              </Text>
            )}
          </View>
        </>
      );
      break;

    case 'unavailable':
      body = (
        <Note
          icon="videocam-off-outline"
          title="Video unavailable"
          sub="This video was removed or made private."
          textColor={textColor}
          subColor={subColor}
        />
      );
      break;

    case 'restricted':
      body = (
        <Note
          icon="logo-youtube"
          title={link.kind === 'short' ? 'YouTube Short' : 'YouTube video'}
          sub="No preview for this video. Tap to open."
          textColor={textColor}
          subColor={subColor}
        />
      );
      break;

    case 'error':
      body = (
        <Note
          icon="cloud-offline-outline"
          title="Couldn't load preview"
          sub="Tap to open on YouTube."
          textColor={textColor}
          subColor={subColor}
        />
      );
      break;
  }

  return (
    <>
      <Pressable
        onPress={gone ? undefined : open}
        onLongPress={onLongPress}
        delayLongPress={250}
        accessibilityRole={gone ? undefined : preview.state === 'ok' ? 'button' : 'link'}
        accessibilityLabel={
          preview.state === 'ok' ? `Play: ${preview.title}` : gone ? 'Video unavailable' : 'YouTube link'
        }
        style={[styles.card, { backgroundColor: background }, gone && styles.gone]}
      >
        {body}
      </Pressable>
      {playing && preview.state === 'ok' && (
        <VideoPlayerModal link={link} title={preview.title} colors={colors} onClose={() => setPlaying(false)} />
      )}
    </>
  );
}

export const LinkPreviewCard = memo(LinkPreviewCardBase);

const styles = StyleSheet.create({
  card: { width: CARD_WIDTH, borderRadius: 12, overflow: 'hidden', marginTop: 6 },
  gone: { opacity: 0.75 },
  thumb: { width: CARD_WIDTH, height: THUMB_HEIGHT, backgroundColor: 'rgba(0,0,0,0.35)' },
  thumbLoading: { alignItems: 'center', justifyContent: 'center' },
  thumbImage: { width: '100%', height: '100%' },
  play: {
    position: 'absolute',
    top: THUMB_HEIGHT / 2 - 20,
    left: CARD_WIDTH / 2 - 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  info: { paddingHorizontal: 10, paddingVertical: 8, gap: 4 },
  title: { fontSize: 14, lineHeight: 18, fontWeight: '600' },
  author: { fontSize: 12 },
  bar: { height: 10, borderRadius: 5, opacity: 0.25 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  noteIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  noteText: { flex: 1, gap: 2 },
  noteTitle: { fontSize: 14, fontWeight: '600' },
});
