/**
 * groupMesh.ts
 * Connects one phone to every other phone in a group call (a "mesh"), without knowing anything about Firebase or
 * react-native-webrtc: both are handed in. That keeps the tricky part (who offers, rejoins, signals arriving out of
 * order, retries) testable in Node with fake peer connections.
 *
 * Rules it follows
 *  - For every pair of people, exactly one of them sends the offer: the one who joined LATER (ties broken by uid).
 *    Both sides compute this from the same server-side join times, so they always agree and never both offer.
 *  - A person who leaves and comes back has a new session id (`sid`). Signals are addressed to a session, so
 *    leftovers from an earlier session are ignored and the old connection is replaced.
 *  - Signals may arrive in any order, and twice. ICE candidates that arrive before their offer are held back; every
 *    signal id is handled once.
 *  - A connection that fails is closed. The offering side tries again a couple of times.
 */

import type { PeerDoc } from './groupCall';

export interface SessionDescriptionData {
  type: 'offer' | 'answer';
  sdp: string;
}

export interface IceCandidateData {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

/** A handshake message from one session to another. `id` is set on incoming ones (the transport's own id). */
interface SignalBase {
  id?: string;
  from: string;
  fromSid: string;
  to: string;
  toSid: string;
}
export type OfferSignal = SignalBase & { kind: 'offer'; sdp: string };
export type AnswerSignal = SignalBase & { kind: 'answer'; sdp: string };
export type CandidateSignal = SignalBase & { kind: 'candidate'; candidate: IceCandidateData };
export type Signal = OfferSignal | AnswerSignal | CandidateSignal;

/** What the mesh needs from a peer connection. The app wraps react-native-webrtc's; tests use a fake. */
export interface PeerConnectionLike<TStream> {
  createOffer(): Promise<SessionDescriptionData>;
  createAnswer(): Promise<SessionDescriptionData>;
  setLocalDescription(description: SessionDescriptionData): Promise<void>;
  setRemoteDescription(description: SessionDescriptionData): Promise<void>;
  addIceCandidate(candidate: IceCandidateData): Promise<void>;
  close(): void;
  onIceCandidate(listener: (candidate: IceCandidateData) => void): void;
  onRemoteStream(listener: (stream: TStream) => void): void;
  onState(listener: (state: 'connecting' | 'connected' | 'disconnected' | 'failed') => void): void;
}

export type MeshPeerState = 'connecting' | 'connected' | 'failed';

export interface MeshPeerInfo<TStream> {
  sid: string;
  state: MeshPeerState;
  stream?: TStream;
}

export interface MeshDeps<TStream> {
  self: { uid: string; sid: string };
  createPeer: () => PeerConnectionLike<TStream>;
  /** Fire and forget; the transport reports its own errors. */
  sendSignal: (signal: Signal) => void;
  /** Called whenever what is known about one other person changes. `null` means they are gone. */
  onPeer: (uid: string, info: MeshPeerInfo<TStream> | null) => void;
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
  /** Wait before an offering side tries a failed connection again. */
  retryDelayMs?: number;
  maxRetries?: number;
  /** A "disconnected" link that has not recovered by then counts as failed. */
  disconnectGraceMs?: number;
  /** An answering connection whose person never showed up in the presence list is dropped after this long. */
  orphanGraceMs?: number;
}

/** True when `a` must send the offer to `b`: the later joiner offers; equal times fall back to the larger uid. */
export function isOfferer(a: { uid: string; joinedAtMs: number }, b: { uid: string; joinedAtMs: number }): boolean {
  if (a.joinedAtMs !== b.joinedAtMs) return a.joinedAtMs > b.joinedAtMs;
  return a.uid > b.uid;
}

interface Conn<TStream> {
  uid: string;
  sid: string;
  pc: PeerConnectionLike<TStream>;
  isOfferer: boolean;
  attempts: number;
  remoteSet: boolean;
  pending: IceCandidateData[];
  seenPresent: boolean;
  createdAt: number;
  state: MeshPeerState;
  stream?: TStream;
  graceTimer?: unknown;
}

export function createMesh<TStream>(deps: MeshDeps<TStream>) {
  const now = deps.now ?? Date.now;
  const schedule = deps.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const cancel = deps.cancel ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const retryDelay = deps.retryDelayMs ?? 2_000;
  const maxRetries = deps.maxRetries ?? 2;
  const disconnectGrace = deps.disconnectGraceMs ?? 8_000;
  const orphanGrace = deps.orphanGraceMs ?? 20_000;
  const { self } = deps;

  const conns = new Map<string, Conn<TStream>>();
  /** Candidates that arrived before the connection they belong to (key: "uid:sid"). */
  const orphans = new Map<string, IceCandidateData[]>();
  const handledIds = new Set<string>();
  /** What the UI was last told about each person (uid -> sid), so departures are always reported. */
  const reported = new Map<string, string>();
  let others: PeerDoc[] = [];
  let closed = false;

  const report = (uid: string, info: MeshPeerInfo<TStream> | null) => {
    if (info) reported.set(uid, info.sid);
    else reported.delete(uid);
    deps.onPeer(uid, info);
  };

  const emit = (conn: Conn<TStream>) => report(conn.uid, { sid: conn.sid, state: conn.state, stream: conn.stream });

  const dispose = (conn: Conn<TStream>) => {
    if (conns.get(conn.uid) === conn) conns.delete(conn.uid);
    if (conn.graceTimer) cancel(conn.graceTimer);
    conn.graceTimer = undefined;
    try {
      conn.pc.close();
    } catch {
      // already closed
    }
  };

  const flushPending = async (conn: Conn<TStream>) => {
    const queued = conn.pending.splice(0);
    for (const candidate of queued) {
      if (conns.get(conn.uid) !== conn) return;
      try {
        await conn.pc.addIceCandidate(candidate);
      } catch {
        // A candidate for a connection that is already settled is harmless.
      }
    }
  };

  const fail = (conn: Conn<TStream>) => {
    if (closed || conns.get(conn.uid) !== conn) return;
    const { uid, sid, isOfferer: offering, attempts } = conn;
    dispose(conn);
    report(uid, { sid, state: 'failed' });
    if (offering && attempts < maxRetries) {
      schedule(() => {
        if (closed || conns.has(uid)) return;
        const person = others.find((o) => o.uid === uid && o.sid === sid);
        if (person) void connectTo(person, attempts + 1);
      }, retryDelay);
    }
  };

  const onPcState = (conn: Conn<TStream>, state: 'connecting' | 'connected' | 'disconnected' | 'failed') => {
    if (closed || conns.get(conn.uid) !== conn) return;
    if (state === 'connected') {
      if (conn.graceTimer) cancel(conn.graceTimer);
      conn.graceTimer = undefined;
      conn.state = 'connected';
      emit(conn);
    } else if (state === 'disconnected') {
      if (!conn.graceTimer) conn.graceTimer = schedule(() => fail(conn), disconnectGrace);
    } else if (state === 'failed') {
      fail(conn);
    } else if (conn.state !== 'connected') {
      conn.state = 'connecting';
    }
  };

  const newConn = (uid: string, sid: string, offering: boolean, attempts: number): Conn<TStream> => {
    const pc = deps.createPeer();
    const conn: Conn<TStream> = {
      uid,
      sid,
      pc,
      isOfferer: offering,
      attempts,
      remoteSet: false,
      pending: [],
      seenPresent: others.some((o) => o.uid === uid && o.sid === sid),
      createdAt: now(),
      state: 'connecting',
    };
    pc.onIceCandidate((candidate) => {
      if (closed || conns.get(uid) !== conn) return;
      deps.sendSignal({ kind: 'candidate', from: self.uid, fromSid: self.sid, to: uid, toSid: sid, candidate });
    });
    pc.onRemoteStream((stream) => {
      if (closed || conns.get(uid) !== conn) return;
      conn.stream = stream;
      emit(conn);
    });
    pc.onState((state) => onPcState(conn, state));
    conns.set(uid, conn);

    const early = orphans.get(`${uid}:${sid}`);
    if (early) {
      conn.pending.push(...early);
      orphans.delete(`${uid}:${sid}`);
    }
    emit(conn);
    return conn;
  };

  async function connectTo(person: PeerDoc, attempts: number): Promise<void> {
    const conn = newConn(person.uid, person.sid, true, attempts);
    try {
      const offer = await conn.pc.createOffer();
      if (conns.get(person.uid) !== conn) return;
      await conn.pc.setLocalDescription(offer);
      if (conns.get(person.uid) !== conn) return;
      deps.sendSignal({ kind: 'offer', from: self.uid, fromSid: self.sid, to: person.uid, toSid: person.sid, sdp: offer.sdp });
    } catch {
      fail(conn);
    }
  }

  async function answerFrom(signal: OfferSignal): Promise<void> {
    const conn = newConn(signal.from, signal.fromSid, false, 0);
    try {
      await conn.pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
      if (conns.get(signal.from) !== conn) return;
      conn.remoteSet = true;
      await flushPending(conn);
      const answer = await conn.pc.createAnswer();
      if (conns.get(signal.from) !== conn) return;
      await conn.pc.setLocalDescription(answer);
      if (conns.get(signal.from) !== conn) return;
      deps.sendSignal({ kind: 'answer', from: self.uid, fromSid: self.sid, to: signal.from, toSid: signal.fromSid, sdp: answer.sdp });
    } catch {
      fail(conn);
    }
  }

  return {
    /**
     * Call with the full presence list (yourself included) whenever it changes. Connects to newcomers you must offer
     * to, drops people who left or rejoined, and waits until your own join time is confirmed by the server.
     */
    setPeers(peers: PeerDoc[]): void {
      if (closed) return;
      const me = peers.find((p) => p.uid === self.uid && p.sid === self.sid);
      others = peers.filter((p) => p.uid !== self.uid);
      const t = now();

      for (const conn of [...conns.values()]) {
        const person = others.find((o) => o.uid === conn.uid);
        if (person && person.sid === conn.sid) {
          conn.seenPresent = true;
        } else if (person || conn.seenPresent || t - conn.createdAt > orphanGrace) {
          // They rejoined with a new session, left, or never showed up: this connection is finished.
          dispose(conn);
        }
      }
      for (const [uid, sid] of [...reported]) {
        const person = others.find((o) => o.uid === uid);
        const conn = conns.get(uid);
        const stillCurrent = !!person && person.sid === sid && (!conn || conn.sid === sid || !!conn);
        if (!stillCurrent && !(conn && conn.sid === sid)) report(uid, null);
      }

      if (!me || !me.joinedAtMs) return;
      for (const person of others) {
        if (conns.has(person.uid) || !person.joinedAtMs) continue;
        if (isOfferer({ uid: self.uid, joinedAtMs: me.joinedAtMs }, person)) void connectTo(person, 0);
      }
    },

    /** Feed every signal addressed to you. Safe to call twice with the same signal. */
    async handleSignal(signal: Signal): Promise<void> {
      if (closed || signal.to !== self.uid || signal.toSid !== self.sid || signal.from === self.uid) return;
      if (signal.id) {
        if (handledIds.has(signal.id)) return;
        handledIds.add(signal.id);
      }

      let conn = conns.get(signal.from);
      if (conn && conn.sid !== signal.fromSid) {
        if (signal.kind !== 'offer') return; // a leftover from their earlier session
        dispose(conn); // they rejoined and are offering again
        conn = undefined;
      }

      if (signal.kind === 'offer') {
        if (conn && conn.isOfferer) return; // both sides offered: the join-order rule should prevent this; keep ours
        if (conn) dispose(conn); // a repeat attempt from the offering side starts clean
        await answerFrom(signal);
        return;
      }

      if (signal.kind === 'answer') {
        if (!conn || !conn.isOfferer || conn.remoteSet) return;
        const target = conn;
        try {
          await target.pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
          if (conns.get(target.uid) !== target) return;
          target.remoteSet = true;
          await flushPending(target);
        } catch {
          fail(target);
        }
        return;
      }

      // candidate
      if (!conn) {
        const key = `${signal.from}:${signal.fromSid}`;
        orphans.set(key, [...(orphans.get(key) ?? []), signal.candidate]);
        return;
      }
      if (!conn.remoteSet) {
        conn.pending.push(signal.candidate);
        return;
      }
      try {
        await conn.pc.addIceCandidate(signal.candidate);
      } catch {
        // ignore: the connection is settled or closing
      }
    },

    /** Hangs up every connection. */
    close(): void {
      closed = true;
      for (const conn of [...conns.values()]) dispose(conn);
      conns.clear();
      orphans.clear();
      reported.clear();
    },
  };
}
