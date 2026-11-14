/**
 * webrtc.web.ts
 * The browser's twin of webrtc.ts. Calls in a browser use the browser's own WebRTC (services/webrtcBrowser.tsx), which exists
 * only on an https:// page or on localhost; anywhere else `getWebRTC()` is null and calls report "unsupported", as in Expo Go.
 * A phone never loads this file. The ICE server list below is webrtc.ts's: when one changes, change the other
 * (tests/unit/streamRegistry.test.ts compares what the two export).
 */

import type { MediaStream } from 'react-native-webrtc';
import { browserWebRTC } from './webrtcBrowser';

export type WebRTCModule = typeof import('react-native-webrtc');

let cached: WebRTCModule | null | undefined;

export function getWebRTC(): WebRTCModule | null {
  if (cached !== undefined) return cached;
  // Static rendering runs this file in Node, where there is no browser: nothing is remembered from there.
  if (typeof window === 'undefined') return null;
  cached = browserWebRTC() as unknown as WebRTCModule | null;
  return cached;
}

/**
 * react-native-webrtc's published typings reference an event-target base class they do not ship, so
 * `addEventListener` is missing from RTCPeerConnection's types even though it exists at runtime.
 * This declares just the listener calls the app uses.
 */
export interface PeerEvents {
  addEventListener(
    type: 'icecandidate',
    listener: (event: {
      candidate: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null } | null;
    }) => void
  ): void;
  addEventListener(type: 'track', listener: (event: { streams: MediaStream[] }) => void): void;
  addEventListener(type: 'connectionstatechange' | 'iceconnectionstatechange', listener: () => void): void;
}

export const isCallingSupported = (): boolean => getWebRTC() !== null;

interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const DEFAULT_STUN = ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'];

const splitList = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * STUN lets two devices find each other; many networks (mobile data, strict Wi-Fi) also need a TURN relay.
 * Configure it in .env (see API.md). Without TURN, calls work on friendly networks only.
 */
export function getIceServers(): IceServer[] {
  const stun = splitList(process.env.EXPO_PUBLIC_STUN_URLS);
  const servers: IceServer[] = [{ urls: stun.length > 0 ? stun : DEFAULT_STUN }];

  const turnUrls = splitList(process.env.EXPO_PUBLIC_TURN_URLS);
  const username = process.env.EXPO_PUBLIC_TURN_USERNAME;
  const credential = process.env.EXPO_PUBLIC_TURN_CREDENTIAL;
  if (turnUrls.length > 0 && username && credential) {
    servers.push({ urls: turnUrls, username, credential });
  }
  return servers;
}

export const hasTurnServer = (): boolean => getIceServers().length > 1;
