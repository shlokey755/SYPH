/**
 * useCallSession.ts
 * Runs one 1-to-1 call: media, the WebRTC peer connection and the Firestore handshake (FR-06).
 *
 *   Caller:  getUserMedia -> offer -> create call doc (ringing) -> wait for answer -> connect
 *   Callee:  read call doc -> getUserMedia -> answer -> mark accepted -> connect
 *
 * Everything runs inside one effect so a single `disposed` flag can stop late async work, and leaving the screen
 * always hangs up. Pure rules (status moves, timeouts, wording) live in utils/call.ts.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaStream } from 'react-native-webrtc';
import {
  acceptCall,
  addCandidate,
  cancelCall,
  CallParty,
  createCall,
  declineCall,
  endCall,
  markCallMissed,
  subscribeCall,
  subscribeRemoteCandidates,
} from '../services/callService';
import { getIceServers, getWebRTC, PeerEvents } from '../services/webrtc';
import { Call, CallCandidate, CallStatus, CallType } from '../types';
import {
  CallEndReason,
  endReasonFromStatus,
  isTerminalStatus,
  RECONNECT_GRACE_MS,
  RING_TIMEOUT_MS,
} from '../utils/call';

export type CallPhase = 'preparing' | 'ringing' | 'connecting' | 'connected' | 'ended';

export interface OutgoingCall {
  conversationId: string;
  type: CallType;
  callee: CallParty;
}

interface Params {
  /** Id of an existing call to answer, or null when placing a new one. */
  callId: string | null;
  /** Required when `callId` is null. */
  outgoing?: OutgoingCall;
  me: CallParty | null;
}

/** How long to wait for the server to accept a new call before giving up (offline, bad network). */
const START_TIMEOUT_MS = 12_000;

interface Controls {
  hangUp: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  switchCamera: () => void;
}

const warn = (what: string) => (error: unknown) =>
  console.warn(`Call: ${what}:`, error instanceof Error ? error.message : error);

export function useCallSession({ callId, outgoing, me }: Params) {
  const [phase, setPhase] = useState<CallPhase>('preparing');
  const [endReason, setEndReason] = useState<CallEndReason | null>(null);
  const [call, setCall] = useState<Call | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [frontCamera, setFrontCamera] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const controlsRef = useRef<Controls | null>(null);
  const isCaller = !callId;

  const myUid = me?.uid;
  const myName = me?.username;
  const outgoingKey = outgoing
    ? `${outgoing.conversationId}|${outgoing.type}|${outgoing.callee.uid}|${outgoing.callee.username}`
    : '';

  useEffect(() => {
    if (!myUid || !myName) return;
    const self: CallParty = { uid: myUid, username: myName };

    let disposed = false;
    let finished = false;
    let activeCallId: string | null = callId;
    let lastStatus: CallStatus | null = null;
    let remoteDescriptionSet = false;
    let answeringStarted = false;
    let connectedOnce = false;

    let pc: InstanceType<NonNullable<ReturnType<typeof getWebRTC>>['RTCPeerConnection']> | null = null;
    let stream: MediaStream | null = null;

    const unsubs: (() => void)[] = [];
    let ringTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const pendingLocal: CallCandidate[] = []; // found before the call id is known
    const pendingRemote: CallCandidate[] = []; // received before the remote description is set

    const clearTimers = () => {
      if (ringTimer) clearTimeout(ringTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ringTimer = null;
      reconnectTimer = null;
    };

    const releaseMedia = () => {
      stream?.getTracks().forEach((t) => t.stop());
      try {
        pc?.close();
      } catch {
        // already closed
      }
      pc = null;
      stream = null;
    };

    /** Stops the call on this device and shows why. The remote side is told separately. */
    const finish = (reason: CallEndReason) => {
      if (finished) return;
      finished = true;
      clearTimers();
      releaseMedia();
      setLocalStream(null);
      setRemoteStream(null);
      setReconnecting(false);
      setEndReason(reason);
      setPhase('ended');
    };

    /** Writes the right "I am leaving" status for wherever the call currently is. */
    const tellRemoteIAmLeaving = () => {
      const id = activeCallId;
      if (!id || !lastStatus) return;
      if (lastStatus === 'ringing') {
        (isCaller ? cancelCall(id) : declineCall(id)).catch(warn('leave while ringing'));
      } else if (lastStatus === 'accepted') {
        endCall(id, self.uid).catch(warn('end call'));
      }
      lastStatus = isCaller && lastStatus === 'ringing' ? 'cancelled' : lastStatus === 'ringing' ? 'declined' : 'ended';
    };

    const WebRTC = getWebRTC();
    if (!WebRTC) {
      finish('unsupported');
      return;
    }

    // ---------- peer connection ----------

    const sendCandidate = (candidate: CallCandidate) => {
      if (!activeCallId) {
        pendingLocal.push(candidate);
        return;
      }
      addCandidate(activeCallId, self.uid, candidate).catch(warn('send candidate'));
    };

    const receiveCandidate = (candidate: CallCandidate) => {
      if (!pc || !remoteDescriptionSet) {
        pendingRemote.push(candidate);
        return;
      }
      pc.addIceCandidate(new WebRTC.RTCIceCandidate(candidate)).catch(warn('add candidate'));
    };

    const flushRemoteCandidates = () => {
      while (pendingRemote.length > 0) receiveCandidate(pendingRemote.shift()!);
    };

    const onLinkState = (state: 'connected' | 'disconnected' | 'failed') => {
      if (finished) return;
      if (state === 'connected') {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = null;
        setReconnecting(false);
        connectedOnce = true;
        setPhase('connected');
      } else if (state === 'disconnected') {
        setReconnecting(true);
        if (!reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            tellRemoteIAmLeaving();
            finish('failed');
          }, RECONNECT_GRACE_MS);
        }
      } else {
        tellRemoteIAmLeaving();
        finish('failed');
      }
    };

    /** Returns false when media could not be opened (the call has already been ended in that case). */
    const openMediaAndPeer = async (type: CallType): Promise<boolean> => {
      try {
        const media = await WebRTC.mediaDevices.getUserMedia({
          audio: true,
          video:
            type === 'video'
              ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } }
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
      const peer = new WebRTC.RTCPeerConnection({ iceServers: getIceServers() });
      pc = peer;
      stream.getTracks().forEach((track) => peer.addTrack(track, stream!));

      const events = peer as unknown as PeerEvents;
      events.addEventListener('icecandidate', (event) => {
        const c = event.candidate;
        if (!c) return;
        sendCandidate({ candidate: c.candidate, sdpMid: c.sdpMid ?? null, sdpMLineIndex: c.sdpMLineIndex ?? null });
      });
      events.addEventListener('track', (event) => {
        const remote = event.streams[0];
        if (remote) setRemoteStream(remote);
      });
      // Both events are wired because platforms differ in which one they reliably emit.
      events.addEventListener('connectionstatechange', () => {
        const s = peer.connectionState;
        if (s === 'connected' || s === 'disconnected' || s === 'failed') onLinkState(s);
      });
      events.addEventListener('iceconnectionstatechange', () => {
        const s = peer.iceConnectionState;
        if (s === 'connected' || s === 'completed') onLinkState('connected');
        else if (s === 'disconnected') onLinkState('disconnected');
        else if (s === 'failed') onLinkState('failed');
      });
      return true;
    };

    // ---------- reacting to the call document ----------

    const startAnswering = async (incoming: Call) => {
      if (!incoming.offer) {
        finish('failed');
        return;
      }
      setPhase('preparing');
      if (!(await openMediaAndPeer(incoming.type))) {
        // Tell the caller to stop ringing. When the screen was left instead, the cleanup has already declined.
        if (!disposed) declineCall(incoming.id).catch(warn('decline after media failure'));
        return;
      }
      try {
        await pc!.setRemoteDescription(new WebRTC.RTCSessionDescription(incoming.offer));
        remoteDescriptionSet = true;
        flushRemoteCandidates();
        const answer = await pc!.createAnswer();
        await pc!.setLocalDescription(answer);
        if (disposed) return;
        await acceptCall(incoming.id, { type: 'answer', sdp: answer.sdp });
        if (!finished) setPhase('connecting');
      } catch (error) {
        // Usually the caller hung up while we were setting up, so the move to "accepted" was refused.
        warn('answer')(error);
        finish(lastStatus && isTerminalStatus(lastStatus) ? endReasonFromStatus(lastStatus) : 'cancelled');
      }
    };

    const onCallChanged = (next: Call | null) => {
      if (finished || disposed) return;
      if (!next) {
        finish('failed');
        return;
      }
      setCall(next);
      lastStatus = next.status;

      if (isTerminalStatus(next.status)) {
        finish(endReasonFromStatus(next.status));
        return;
      }

      if (isCaller) {
        if (next.status === 'accepted' && next.answer && !remoteDescriptionSet && pc) {
          setPhase('connecting');
          if (ringTimer) clearTimeout(ringTimer);
          ringTimer = null;
          pc.setRemoteDescription(new WebRTC.RTCSessionDescription(next.answer))
            .then(() => {
              remoteDescriptionSet = true;
              flushRemoteCandidates();
            })
            .catch((error) => {
              warn('apply answer')(error);
              tellRemoteIAmLeaving();
              finish('failed');
            });
        }
      } else if (next.status === 'ringing' && !answeringStarted) {
        answeringStarted = true;
        void startAnswering(next);
      }
    };

    const watchCall = (id: string) => {
      unsubs.push(subscribeCall(id, onCallChanged, (error) => {
        warn('call listener')(error);
        finish('failed');
      }));
      unsubs.push(subscribeRemoteCandidates(id, self.uid, receiveCandidate));
    };

    // ---------- starting ----------

    const startOutgoing = async (plan: OutgoingCall) => {
      if (!(await openMediaAndPeer(plan.type))) return;
      try {
        const offer = await pc!.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: plan.type === 'video',
        });
        await pc!.setLocalDescription(offer);
        if (disposed || finished) return; // hung up before the call was even placed

        const { id, committed } = createCall({
          conversationId: plan.conversationId,
          caller: self,
          callee: plan.callee,
          type: plan.type,
          offer: { type: 'offer', sdp: offer.sdp },
        });
        activeCallId = id;
        lastStatus = 'ringing';

        await Promise.race([
          committed,
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), START_TIMEOUT_MS)),
        ]);
        // Hung up while the call was being placed: the hang-up path has already queued the cancel.
        if (disposed || finished) return;

        while (pendingLocal.length > 0) sendCandidate(pendingLocal.shift()!);
        setPhase('ringing');
        watchCall(id);
        ringTimer = setTimeout(() => {
          if (lastStatus !== 'ringing') return;
          markCallMissed(id).catch(warn('mark missed'));
          lastStatus = 'missed';
          finish('missed');
        }, RING_TIMEOUT_MS);
      } catch (error) {
        warn('start call')(error);
        if (activeCallId && !finished) cancelCall(activeCallId).catch(() => {});
        finish('failed');
      }
    };

    // ---------- controls ----------

    controlsRef.current = {
      hangUp: () => {
        if (finished) return;
        const asCaller = isCaller;
        const wasRinging = lastStatus === 'ringing';
        tellRemoteIAmLeaving();
        finish(wasRinging ? (asCaller ? 'cancelled' : 'declined') : 'ended');
      },
      toggleMute: () => {
        const tracks = stream?.getAudioTracks() ?? [];
        const nextMuted = tracks.some((t) => t.enabled);
        tracks.forEach((t) => (t.enabled = !nextMuted));
        setMuted(nextMuted);
      },
      toggleCamera: () => {
        const tracks = stream?.getVideoTracks() ?? [];
        const nextOff = tracks.some((t) => t.enabled);
        tracks.forEach((t) => (t.enabled = !nextOff));
        setCameraOff(nextOff);
      },
      switchCamera: () => {
        const track = stream?.getVideoTracks()[0];
        if (!track) return;
        track._switchCamera();
        setFrontCamera((front) => !front);
      },
    };

    // ---------- go ----------

    if (callId) {
      watchCall(callId); // answering: the first snapshot kicks off startAnswering
    } else if (outgoing) {
      void startOutgoing(outgoing);
    } else {
      finish('failed');
    }

    return () => {
      disposed = true;
      controlsRef.current = null;
      if (!finished && (connectedOnce || lastStatus === 'ringing' || lastStatus === 'accepted')) {
        tellRemoteIAmLeaving(); // leaving the screen hangs up
      }
      unsubs.forEach((unsub) => unsub());
      clearTimers();
      releaseMedia();
    };
    // outgoingKey stands in for the `outgoing` object so a re-render with equal values does not restart the call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, outgoingKey, myUid, myName]);

  // Call timer: counts while connected.
  useEffect(() => {
    if (phase !== 'connected') return;
    const startedAt = Date.now();
    setSeconds(0);
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const hangUp = useCallback(() => controlsRef.current?.hangUp(), []);
  const toggleMute = useCallback(() => controlsRef.current?.toggleMute(), []);
  const toggleCamera = useCallback(() => controlsRef.current?.toggleCamera(), []);
  const switchCamera = useCallback(() => controlsRef.current?.switchCamera(), []);

  return {
    phase,
    endReason,
    call,
    isCaller,
    localStream,
    remoteStream,
    muted,
    cameraOff,
    frontCamera,
    reconnecting,
    seconds,
    hangUp,
    toggleMute,
    toggleCamera,
    switchCamera,
  };
}
