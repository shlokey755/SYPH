/**
 * webrtcBrowser.tsx
 * The browser's own WebRTC, in the shape the call code expects from react-native-webrtc, so the same hooks and screens run
 * in a browser (services/webrtc.web.ts hands it out). A browser already has the peer connection, the media devices and the
 * session and candidate classes, so most of this is the browser's globals under react-native-webrtc's names. What it adds:
 *   - `RTCView`, which in a browser is a <video> element given the stream itself;
 *   - `stream.toURL()` and `track._switchCamera()`, which the call screens call and a browser stream does not have;
 *   - the other person's voice: a phone plays it by itself, a browser plays it only through a media element.
 * A phone never loads this file.
 */

import { useEffect, useRef } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { streamAddress, streamAt } from '../utils/streamRegistry';

/** The other person's voice: one hidden <audio> element for each remote stream that has sound. */
const voices = new Map<string, HTMLAudioElement>();

function hear(stream: MediaStream): void {
  if (voices.has(stream.id)) return;
  const voice = new Audio();
  voice.autoplay = true;
  voice.srcObject = stream;
  voices.set(stream.id, voice);
  // A call starts from a click, so the page has been touched and the browser allows the sound.
  void voice.play().catch(() => {});
}

function stopHearing(id: string): void {
  const voice = voices.get(id);
  if (!voice) return;
  voice.pause();
  voice.srcObject = null;
  voices.delete(id);
}

/** A browser peer connection that also plays the sound it receives, and stops when the connection is closed. */
class BrowserPeerConnection extends RTCPeerConnection {
  private readonly heard = new Set<string>();

  constructor(configuration?: RTCConfiguration) {
    super(configuration);
    this.addEventListener('track', (event) => {
      if (event.track.kind !== 'audio') return;
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      this.heard.add(stream.id);
      hear(stream);
    });
  }

  override close(): void {
    this.heard.forEach(stopHearing);
    this.heard.clear();
    super.close();
  }
}

interface RTCViewProps {
  /** An address from `stream.toURL()`. */
  streamURL: string;
  style?: StyleProp<ViewStyle>;
  objectFit?: 'contain' | 'cover';
  /** Flips the picture left to right, as a mirror does (your own camera). */
  mirror?: boolean;
  /** Ignored: stacking in a browser follows the page. */
  zOrder?: number;
}

/** The picture of a stream. It has no sound of its own: the voice is played once, by `hear`, whether or not a picture is shown. */
function RTCView({ streamURL, style, objectFit = 'cover', mirror = false }: RTCViewProps) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.srcObject = streamAt<MediaStream>(streamURL);
    void element.play().catch(() => {});
    return () => {
      element.srcObject = null;
    };
  }, [streamURL]);

  return (
    <View pointerEvents="none" style={style}>
      <video
        ref={video}
        autoPlay
        playsInline
        muted
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          objectFit,
          transform: mirror ? 'scaleX(-1)' : undefined,
          backgroundColor: '#000000',
        }}
      />
    </View>
  );
}

let bridged = false;

/** Gives browser streams and tracks the two react-native-webrtc calls that the call screens make. */
function bridge(): void {
  if (bridged) return;
  bridged = true;
  if (!('toURL' in MediaStream.prototype)) {
    Object.defineProperty(MediaStream.prototype, 'toURL', {
      configurable: true,
      value(this: MediaStream): string {
        return streamAddress(this);
      },
    });
  }
  // Turning between a front and a back camera means nothing on a computer, so that button changes nothing here.
  if (!('_switchCamera' in MediaStreamTrack.prototype)) {
    Object.defineProperty(MediaStreamTrack.prototype, '_switchCamera', { configurable: true, value() {} });
  }
}

/**
 * The browser's WebRTC under react-native-webrtc's names, or null where the browser has none. A browser hands out the
 * microphone and camera only to https:// pages and to localhost; on any other address `navigator.mediaDevices` is missing.
 */
export function browserWebRTC() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return null;
  if (typeof RTCPeerConnection === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  bridge();
  return {
    RTCPeerConnection: BrowserPeerConnection,
    RTCIceCandidate,
    RTCSessionDescription,
    MediaStream,
    MediaStreamTrack,
    mediaDevices: navigator.mediaDevices,
    RTCView,
    registerGlobals: () => {},
  };
}
