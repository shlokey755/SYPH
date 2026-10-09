/**
 * webrtc.ts
 * Loads react-native-webrtc only where it can work, and builds the ICE server list.
 *
 * WebRTC is a native module: it is not in Expo Go, and it does not exist on web. It is therefore required lazily
 * and every caller checks `getWebRTC()` for null, so Expo Go keeps running (calls just report "unsupported").
 */

import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

import type { MediaStream } from 'react-native-webrtc';

export type WebRTCModule = typeof import('react-native-webrtc');

let cached: WebRTCModule | null | undefined;

export function getWebRTC(): WebRTCModule | null {
  if (cached !== undefined) return cached;
  if (Platform.OS === 'web' || isRunningInExpoGo()) {
    cached = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('react-native-webrtc') as WebRTCModule;
  } catch (error) {
    // A build made before the plugin was added has no native module; treat it as unsupported.
    console.warn('react-native-webrtc is unavailable:', error);
    cached = null;
  }
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
 * STUN lets two phones find each other; many networks (mobile data, strict Wi-Fi) also need a TURN relay.
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
