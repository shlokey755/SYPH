/**
 * useGroupCallSession.ts
 * Runs one group call: media, a peer connection to every other person, and the Firestore handshake.
 *
 *   Start:  open camera/mic -> mark the group as "in a call" -> write my presence -> connect to whoever is there
 *   Join:   open camera/mic -> read who is there (full? stop) -> write my presence -> connect to them
 *
 * The tricky part (who offers, rejoins, signals out of order, retries) lives in utils/groupMesh.ts and is unit tested
 * with fake peers; this file only wires it to react-native-webrtc and Firestore. Like the 1-to-1 hook it runs inside
 * one effect with a `disposed` flag, and leaving the screen leaves the call.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaStream } from 'react-native-webrtc';
import {
  chooseCallRoute,
  ensureBluetoothAccess,
  onAudioRouteChange,
  startCallAudio,
  stopCallAudio,
} from '../services/callAudio';
import {
  beatPeer,
  beatPointer,
  endPointer,
  newGroupCallId,
  removePeer,
  sendSignal,
  startOrJoinPointer,
  subscribePeers,
  subscribeSignals,
  updatePeerMedia,
  writePeer,
} from '../services/groupCallService';
import { notifyGroupCall } from '../services/pushSender';
import { getIceServers, getWebRTC, PeerEvents } from '../services/webrtc';
import { CallType } from '../types';
import { AudioRoute, nextRoute, RouteState } from '../utils/audioRoute';
import { defaultSpeakerOn } from '../utils/call';
import { canJoin, createPresenceTracker, GroupEndReason, PEER_BEAT_MS, POINTER_BEAT_MS } from '../utils/groupCall';
import { createMesh, MeshPeerInfo, PeerConnectionLike } from '../utils/groupMesh';

export type GroupCallPhase = 'preparing' | 'in-call' | 'ended';

export interface GroupParticipant {
  uid: string;
  username: string;
  muted: boolean;
  cameraOff: boolean;
  /** How the connection to this person is going. */
  state: 'connecting' | 'connected' | 'failed';
  stream: MediaStream | null;
}

interface Params {
  conversationId: string | undefined;
  /** Used to notify the other members when a call starts; may arrive after the call has begun. */
  conversation?: { id: string; participantIds: string[]; groupName?: string };
  /** Id of a call to join, or null to start a new one. */
  callId: string | null;
  /** The type to start with; when joining, the type of the call being joined. */
  type: CallType;
  me: { uid: string; username: string } | null;
}

/** How long to wait for the server when starting a call before giving up (offline, bad network). */
const START_TIMEOUT_MS = 12_000;

const warn = (what: string) => (error: unknown) =>
  console.warn(`Group call: ${what}:`, error instanceof Error ? error.message : error);

const randomSessionId = () => `${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

export function useGroupCallSession({ conversationId, conversation, callId, type, me }: Params) {
  const [phase, setPhase] = useState<GroupCallPhase>('preparing');
  const [endReason, setEndReason] = useState<GroupEndReason | null>(null);
  const [callType, setCallType] = useState<CallType>(type);
  const [participants, setParticipants] = useState<GroupParticipant[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [frontCamera, setFrontCamera] = useState(true);
  const [audioRoute, setAudioRoute] = useState<AudioRoute>('earpiece');
  const [seconds, setSeconds] = useState(0);

  const controlsRef = useRef<{
    hangUp: () => void;
    toggleMute: () => void;
    toggleCamera: () => void;
    switchCamera: () => void;
    toggleSpeaker: () => void;
  } | null>(null);

  // The conversation object changes on every snapshot; only its id decides whether the call restarts.
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;
  const myUid = me?.uid;
  const myName = me?.username;

  useEffect(() => {
    if (!myUid || !myName || !conversationId) return;
    const self = { uid: myUid, username: myName };

    let disposed = false;
    let finished = false;
    let joined = false;
    let activeCallId: string | null = callId;
    let wantedType: CallType = type;
    let stream: MediaStream | null = null;
    let cameraIsOff = false;
    let micMuted = false;
    let routes: RouteState = { available: [], selected: null };
    let stopRouteUpdates: (() => void) | null = null;
    let audioRouted = false;
    let lastPointerBeat = 0;
    let beatTimer: ReturnType<typeof setInterval> | null = null;
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;
    const sid = randomSessionId();
    const unsubs: (() => void)[] = [];
    const tracker = createPresenceTracker();
    const meshInfo = new Map<string, MeshPeerInfo<MediaStream>>();
    let mesh: ReturnType<typeof createMesh<MediaStream>> | null = null;

    const WebRTC = getWebRTC();

    // ---------- who is here ----------

    const others = () => tracker.present(Date.now()).filter((p) => p.uid !== self.uid);

    const publishParticipants = () => {
      if (finished) return;
      setParticipants(
        others().map((p) => {
          const info = meshInfo.get(p.uid);
          return {
            uid: p.uid,
            username: p.username,
            muted: p.muted,
            cameraOff: p.cameraOff,
            state: info?.state ?? 'connecting',
            stream: info?.stream ?? null,
          };
        })
      );
    };

    /** Re-evaluates presence now, hands it to the mesh, and schedules the next check for when someone would expire. */
    const refreshPresence = () => {
      if (finished) return;
      if (expiryTimer) clearTimeout(expiryTimer);
      expiryTimer = null;
      const now = Date.now();
      mesh?.setPeers(tracker.present(now));
      publishParticipants();
      const wait = tracker.nextExpiryIn(now);
      if (wait !== null) expiryTimer = setTimeout(refreshPresence, wait + 50);
    };

    // ---------- leaving ----------

    const teardown = () => {
      if (beatTimer) clearInterval(beatTimer);
      if (expiryTimer) clearTimeout(expiryTimer);
      beatTimer = null;
      expiryTimer = null;
      mesh?.close();
      mesh = null;
      unsubs.splice(0).forEach((unsub) => unsub());
      stopRouteUpdates?.();
      stopRouteUpdates = null;
      if (audioRouted) {
        audioRouted = false;
        stopCallAudio();
      }
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
    };

    /** Tells the group I left, and closes the call for everyone if I was the last one. */
    const leaveRemote = () => {
      if (!joined || !activeCallId) return;
      const id = activeCallId;
      const lastOneOut = others().length === 0;
      joined = false;
      removePeer(conversationId, id, self.uid).catch(warn('leave'));
      if (lastOneOut) endPointer(conversationId, id).catch(warn('end call'));
    };

    const finish = (reason: GroupEndReason) => {
      if (finished) return;
      leaveRemote();
      finished = true;
      teardown();
      setLocalStream(null);
      setParticipants([]);
      setEndReason(reason);
      setPhase('ended');
    };

    if (!WebRTC) {
      finish('unsupported');
      return;
    }

    // ---------- one peer connection (what the mesh asks for) ----------

    const makePeer = (): PeerConnectionLike<MediaStream> => {
      const pc = new WebRTC.RTCPeerConnection({ iceServers: getIceServers() });
      stream?.getTracks().forEach((track) => pc.addTrack(track, stream!));

      let onIce: ((c: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null }) => void) | undefined;
      let onStream: ((s: MediaStream) => void) | undefined;
      let onState: ((s: 'connecting' | 'connected' | 'disconnected' | 'failed') => void) | undefined;

      const events = pc as unknown as PeerEvents;
      events.addEventListener('icecandidate', (event) => {
        const c = event.candidate;
        if (c) onIce?.({ candidate: c.candidate, sdpMid: c.sdpMid ?? null, sdpMLineIndex: c.sdpMLineIndex ?? null });
      });
      events.addEventListener('track', (event) => {
        const remote = event.streams[0];
        if (remote) onStream?.(remote);
      });
      // Both events are wired because platforms differ in which one they reliably emit (same as 1-to-1 calls).
      events.addEventListener('connectionstatechange', () => {
        const s = pc.connectionState;
        if (s === 'connected' || s === 'disconnected' || s === 'failed') onState?.(s);
        else onState?.('connecting');
      });
      events.addEventListener('iceconnectionstatechange', () => {
        const s = pc.iceConnectionState;
        if (s === 'connected' || s === 'completed') onState?.('connected');
        else if (s === 'disconnected' || s === 'failed') onState?.(s);
      });

      return {
        createOffer: async () => {
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: wantedType === 'video',
          });
          return { type: 'offer', sdp: offer.sdp };
        },
        createAnswer: async () => {
          const answer = await pc.createAnswer();
          return { type: 'answer', sdp: answer.sdp };
        },
        setLocalDescription: (d) => pc.setLocalDescription(new WebRTC.RTCSessionDescription(d)),
        setRemoteDescription: (d) => pc.setRemoteDescription(new WebRTC.RTCSessionDescription(d)),
        addIceCandidate: (c) => pc.addIceCandidate(new WebRTC.RTCIceCandidate(c)),
        close: () => pc.close(),
        onIceCandidate: (l) => (onIce = l),
        onRemoteStream: (l) => (onStream = l),
        onState: (l) => (onState = l),
      };
    };

    // ---------- media ----------

    /** Returns false when the camera / microphone could not be opened (the call has already been ended). */
    const openMedia = async (): Promise<boolean> => {
      try {
        const media = await WebRTC.mediaDevices.getUserMedia({
          audio: true,
          // Smaller than a 1-to-1 call: in a group every video is sent once per person.
          video:
            wantedType === 'video'
              ? { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 360 }, frameRate: { ideal: 15 } }
              : false,
        });
        if (disposed) {
          media.getTracks().forEach((t) => t.stop());
          return false;
        }
        stream = media;
      } catch (error) {
        warn('getUserMedia')(error);
        finish('permission');
        return false;
      }
      setLocalStream(stream);
      setAudioRoute(defaultSpeakerOn(wantedType) ? 'speaker' : 'earpiece');
      // Android 12+ hides Bluetooth earphones from an app that has not been allowed to use them, so ask first.
      await ensureBluetoothAccess();
      if (disposed) return false;
      stopRouteUpdates = onAudioRouteChange((state) => {
        routes = state;
        if (state.selected) setAudioRoute(state.selected);
      });
      audioRouted = startCallAudio(wantedType);
      return true;
    };

    // ---------- joining ----------

    const shareMedia = () => {
      if (joined && activeCallId) {
        updatePeerMedia(conversationId, activeCallId, self.uid, { cameraOff: cameraIsOff, muted: micMuted }).catch(
          warn('share media state')
        );
      }
    };

    /** Writes my presence and starts the heartbeat. Called once the presence list has been read and there is room. */
    const join = () => {
      if (joined || finished || !activeCallId) return;
      const id = activeCallId;
      joined = true;
      writePeer(conversationId, id, { uid: self.uid, sid, username: self.username, cameraOff: cameraIsOff, muted: micMuted }).catch(
        (error) => {
          warn('join')(error);
          finish('failed');
        }
      );
      setPhase('in-call');
      lastPointerBeat = Date.now();

      beatTimer = setInterval(() => {
        if (finished) return;
        beatPeer(conversationId, id, self.uid).catch(warn('heartbeat'));
        // The longest-standing person keeps the group's "call in progress" marker fresh; if they drop, the next one does.
        const now = Date.now();
        const oldest = tracker.present(now)[0];
        if (oldest?.uid === self.uid && now - lastPointerBeat >= POINTER_BEAT_MS) {
          lastPointerBeat = now;
          beatPointer(conversationId, id).catch(warn('pointer beat'));
        }
      }, PEER_BEAT_MS);
    };

    const begin = () => {
      const id = activeCallId;
      if (!id) return;
      mesh = createMesh<MediaStream>({
        self: { uid: self.uid, sid },
        createPeer: makePeer,
        sendSignal: (signal) => sendSignal(conversationId, id, signal).catch(warn('send signal')),
        onPeer: (uid, info) => {
          if (info) meshInfo.set(uid, info);
          else meshInfo.delete(uid);
          publishParticipants();
        },
      });

      unsubs.push(
        subscribeSignals(conversationId, id, self.uid, (signal) => void mesh?.handleSignal(signal), warn('signal listener'))
      );

      let firstSnapshot = true;
      unsubs.push(
        subscribePeers(
          conversationId,
          id,
          (docs) => {
            if (finished) return;
            tracker.update(docs, Date.now());
            if (firstSnapshot) {
              firstSnapshot = false;
              // Is there room? Decide before announcing myself.
              if (!canJoin(wantedType, others().length)) {
                finish('full');
                return;
              }
              join();
            }
            refreshPresence();
          },
          (error) => {
            warn('presence listener')(error);
            finish('failed');
          }
        )
      );
    };

    const start = async () => {
      if (!(await openMedia())) return;

      if (!activeCallId) {
        // Starting: mark the group as in a call. If someone started one a moment ago, join theirs instead.
        const id = newGroupCallId(conversationId);
        const now = Date.now();
        try {
          const result = await Promise.race([
            startOrJoinPointer(conversationId, { id, type: wantedType, startedBy: self.uid, startedByName: self.username, startedAt: now, beat: now }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), START_TIMEOUT_MS)),
          ]);
          if (disposed || finished) {
            // Left before the call began: do not leave the group showing a call nobody is in.
            if (result.kind === 'started') endPointer(conversationId, result.call.id).catch(warn('end call'));
            return;
          }
          activeCallId = result.call.id;
          if (result.kind === 'existing') {
            wantedType = result.call.type;
            if (wantedType === 'audio') {
              // Joining a voice call with a camera open: drop the video so only audio is sent.
              stream?.getVideoTracks().forEach((t) => {
                t.stop();
                stream?.removeTrack(t);
              });
            }
          } else {
            const convo = conversationRef.current;
            if (convo) {
              void notifyGroupCall({
                callId: id,
                conversation: convo,
                callerUid: self.uid,
                callerName: self.username,
                type: wantedType,
              });
            }
          }
          setCallType(wantedType);
        } catch (error) {
          warn('start')(error);
          finish('failed');
          return;
        }
      }
      begin();
    };

    // ---------- controls ----------

    controlsRef.current = {
      hangUp: () => finish('left'),
      toggleMute: () => {
        const tracks = stream?.getAudioTracks() ?? [];
        const nextMuted = tracks.some((t) => t.enabled);
        tracks.forEach((t) => (t.enabled = !nextMuted));
        micMuted = nextMuted;
        setMuted(nextMuted);
        shareMedia();
      },
      toggleCamera: () => {
        const tracks = stream?.getVideoTracks() ?? [];
        if (tracks.length === 0) return; // voice call
        const nextOff = tracks.some((t) => t.enabled);
        tracks.forEach((t) => (t.enabled = !nextOff));
        cameraIsOff = nextOff;
        setCameraOff(nextOff);
        shareMedia();
      },
      // Steps through the routes the phone can use: earphones (Bluetooth or wired), speaker, earpiece.
      toggleSpeaker: () => {
        const next = nextRoute(routes);
        if (!next || !chooseCallRoute(next)) return;
        routes = { ...routes, selected: next };
        setAudioRoute(next);
      },
      switchCamera: () => {
        const track = stream?.getVideoTracks()[0];
        if (!track) return;
        track._switchCamera();
        setFrontCamera((front) => !front);
      },
    };

    void start();

    return () => {
      disposed = true;
      controlsRef.current = null;
      if (!finished) {
        leaveRemote(); // leaving the screen leaves the call
        finished = true;
        teardown();
      }
    };
    // callId / type / conversationId pick the call; the rest is read through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, callId, type, myUid, myName]);

  // Call timer: counts from the moment I joined.
  useEffect(() => {
    if (phase !== 'in-call') return;
    const startedAt = Date.now();
    setSeconds(0);
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const hangUp = useCallback(() => controlsRef.current?.hangUp(), []);
  const toggleMute = useCallback(() => controlsRef.current?.toggleMute(), []);
  const toggleCamera = useCallback(() => controlsRef.current?.toggleCamera(), []);
  const switchCamera = useCallback(() => controlsRef.current?.switchCamera(), []);
  const toggleSpeaker = useCallback(() => controlsRef.current?.toggleSpeaker(), []);

  return {
    phase,
    endReason,
    callType,
    participants,
    localStream,
    muted,
    cameraOff,
    frontCamera,
    audioRoute,
    seconds,
    hangUp,
    toggleMute,
    toggleCamera,
    switchCamera,
    toggleSpeaker,
  };
}
