import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createMesh,
  isOfferer,
  type IceCandidateData,
  type MeshPeerInfo,
  type PeerConnectionLike,
  type SessionDescriptionData,
  type Signal,
} from '../../src/utils/groupMesh.ts';
import type { PeerDoc } from '../../src/utils/groupCall.ts';

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

class FakePc implements PeerConnectionLike<string> {
  closed = false;
  local?: SessionDescriptionData;
  remote?: SessionDescriptionData;
  candidates: IceCandidateData[] = [];
  order: string[] = [];
  private onCandidate: (c: IceCandidateData) => void = () => {};
  private onStream: (s: string) => void = () => {};
  private onStateListener: (s: 'connecting' | 'connected' | 'disconnected' | 'failed') => void = () => {};
  readonly label: string;
  constructor(label: string) { this.label = label; }
  async createOffer() { this.order.push('createOffer'); return { type: 'offer' as const, sdp: `offer:${this.label}` }; }
  async createAnswer() { this.order.push('createAnswer'); return { type: 'answer' as const, sdp: `answer:${this.label}` }; }
  async setLocalDescription(d: SessionDescriptionData) { this.local = d; this.order.push('setLocal'); }
  async setRemoteDescription(d: SessionDescriptionData) { this.remote = d; this.order.push('setRemote'); }
  async addIceCandidate(c: IceCandidateData) { this.order.push('addIce'); this.candidates.push(c); }
  close() { this.closed = true; }
  onIceCandidate(l: (c: IceCandidateData) => void) { this.onCandidate = l; }
  onRemoteStream(l: (s: string) => void) { this.onStream = l; }
  onState(l: (s: 'connecting' | 'connected' | 'disconnected' | 'failed') => void) { this.onStateListener = l; }
  // test helpers
  emitCandidate(c: IceCandidateData) { this.onCandidate(c); }
  emitStream(s: string) { this.onStream(s); }
  emitState(s: 'connecting' | 'connected' | 'disconnected' | 'failed') { this.onStateListener(s); }
}

const cand = (n: number): IceCandidateData => ({ candidate: `cand${n}`, sdpMid: '0', sdpMLineIndex: 0 });
const doc = (uid: string, joinedAtMs: number, sid = `${uid}-s`): PeerDoc => ({
  uid, sid, username: uid, joinedAtMs, lastSeenMs: joinedAtMs, cameraOff: false, muted: false,
});

function harness(uid: string, sid = `${uid}-s`, extra: Record<string, unknown> = {}) {
  const pcs: FakePc[] = [];
  const sent: Signal[] = [];
  const peerEvents: [string, MeshPeerInfo<string> | null][] = [];
  const timers: { fn: () => void; ms: number; cancelled: boolean }[] = [];
  const mesh = createMesh<string>({
    self: { uid, sid },
    createPeer: () => { const pc = new FakePc(`${uid}#${pcs.length}`); pcs.push(pc); return pc; },
    sendSignal: (s) => sent.push(s),
    onPeer: (u, info) => peerEvents.push([u, info]),
    now: () => 1_000,
    schedule: (fn, ms) => { const t = { fn, ms, cancelled: false }; timers.push(t); return t; },
    cancel: (h) => { (h as { cancelled: boolean }).cancelled = true; },
    ...extra,
  });
  const runTimers = () => { for (const t of timers.splice(0)) if (!t.cancelled) t.fn(); };
  return { mesh, pcs, sent, peerEvents, timers, runTimers };
}

describe('who sends the offer', () => {
  it('the later joiner offers; equal times fall back to the larger uid', () => {
    assert.equal(isOfferer({ uid: 'a', joinedAtMs: 200 }, { uid: 'b', joinedAtMs: 100 }), true);
    assert.equal(isOfferer({ uid: 'b', joinedAtMs: 100 }, { uid: 'a', joinedAtMs: 200 }), false);
    assert.equal(isOfferer({ uid: 'b', joinedAtMs: 100 }, { uid: 'a', joinedAtMs: 100 }), true);
    assert.equal(isOfferer({ uid: 'a', joinedAtMs: 100 }, { uid: 'b', joinedAtMs: 100 }), false);
  });

  it('exactly one side of every pair offers', () => {
    const early = harness('amy');
    const late = harness('bob');
    const peers = [doc('amy', 100), doc('bob', 200)];
    early.mesh.setPeers(peers);
    late.mesh.setPeers(peers);
    return flush().then(() => {
      assert.equal(early.sent.length, 0);
      assert.equal(late.sent.length, 1);
      assert.equal(late.sent[0].kind, 'offer');
      assert.equal(late.sent[0].to, 'amy');
      assert.equal(late.sent[0].toSid, 'amy-s');
      assert.equal(late.sent[0].fromSid, 'bob-s');
    });
  });

  it('waits until its own join time is confirmed by the server', async () => {
    const h = harness('bob');
    h.mesh.setPeers([doc('amy', 100), doc('bob', 0)]);
    await flush();
    assert.equal(h.sent.length, 0);
    h.mesh.setPeers([doc('amy', 100), doc('bob', 200)]);
    await flush();
    assert.equal(h.sent.length, 1);
  });

  it('does not offer to someone whose own join time is unresolved', async () => {
    const h = harness('bob');
    h.mesh.setPeers([doc('amy', 0), doc('bob', 200)]);
    await flush();
    assert.equal(h.sent.length, 0);
  });

  it('offers to every earlier joiner, once each', async () => {
    const h = harness('dan');
    const peers = [doc('amy', 100), doc('bob', 200), doc('cat', 300), doc('dan', 400)];
    h.mesh.setPeers(peers);
    h.mesh.setPeers(peers);
    await flush();
    assert.deepEqual(h.sent.map((s) => s.to).sort(), ['amy', 'bob', 'cat']);
  });
});

describe('answering', () => {
  it('answers an offer addressed to this session', async () => {
    const h = harness('amy');
    h.mesh.setPeers([doc('amy', 100), doc('bob', 200)]);
    await h.mesh.handleSignal({ id: 's1', kind: 'offer', from: 'bob', fromSid: 'bob-s', to: 'amy', toSid: 'amy-s', sdp: 'offer:x' });
    assert.deepEqual(h.pcs[0].order, ['setRemote', 'createAnswer', 'setLocal']);
    assert.equal(h.sent.length, 1);
    assert.equal(h.sent[0].kind, 'answer');
    assert.equal(h.sent[0].to, 'bob');
    assert.equal(h.sent[0].toSid, 'bob-s');
  });

  it('ignores signals for another session or from itself', async () => {
    const h = harness('amy');
    await h.mesh.handleSignal({ id: 'a', kind: 'offer', from: 'bob', fromSid: 'bob-s', to: 'amy', toSid: 'OLD-SESSION', sdp: 'x' });
    await h.mesh.handleSignal({ id: 'b', kind: 'offer', from: 'bob', fromSid: 'bob-s', to: 'cat', toSid: 'cat-s', sdp: 'x' });
    await h.mesh.handleSignal({ id: 'c', kind: 'offer', from: 'amy', fromSid: 'amy-s', to: 'amy', toSid: 'amy-s', sdp: 'x' });
    assert.equal(h.pcs.length, 0);
  });

  it('handles each signal id once', async () => {
    const h = harness('amy');
    const offer: Signal = { id: 's1', kind: 'offer', from: 'bob', fromSid: 'bob-s', to: 'amy', toSid: 'amy-s', sdp: 'x' };
    await h.mesh.handleSignal(offer);
    await h.mesh.handleSignal(offer);
    assert.equal(h.pcs.length, 1);
    assert.equal(h.sent.length, 1);
  });

  it('holds candidates that arrive before their offer, then applies them after the remote description', async () => {
    const h = harness('amy');
    await h.mesh.handleSignal({ id: 'c1', kind: 'candidate', from: 'bob', fromSid: 'bob-s', to: 'amy', toSid: 'amy-s', candidate: cand(1) });
    await h.mesh.handleSignal({ id: 'c2', kind: 'candidate', from: 'bob', fromSid: 'bob-s', to: 'amy', toSid: 'amy-s', candidate: cand(2) });
    assert.equal(h.pcs.length, 0);
    await h.mesh.handleSignal({ id: 'o1', kind: 'offer', from: 'bob', fromSid: 'bob-s', to: 'amy', toSid: 'amy-s', sdp: 'x' });
    assert.deepEqual(h.pcs[0].candidates.map((c) => c.candidate), ['cand1', 'cand2']);
    assert.equal(h.pcs[0].order.indexOf('setRemote') < h.pcs[0].order.indexOf('addIce'), true);
  });

  it('sends its own ICE candidates to the right session', async () => {
    const h = harness('amy');
    await h.mesh.handleSignal({ id: 'o1', kind: 'offer', from: 'bob', fromSid: 'bob-s', to: 'amy', toSid: 'amy-s', sdp: 'x' });
    h.pcs[0].emitCandidate(cand(9));
    const last = h.sent.at(-1)!;
    assert.equal(last.kind, 'candidate');
    assert.equal(last.to, 'bob');
    assert.equal(last.toSid, 'bob-s');
  });
});

describe('offering', () => {
  it('applies the answer, then queued candidates; candidates before the answer wait', async () => {
    const h = harness('bob');
    h.mesh.setPeers([doc('amy', 100), doc('bob', 200)]);
    await flush();
    await h.mesh.handleSignal({ id: 'c1', kind: 'candidate', from: 'amy', fromSid: 'amy-s', to: 'bob', toSid: 'bob-s', candidate: cand(1) });
    assert.equal(h.pcs[0].candidates.length, 0);
    await h.mesh.handleSignal({ id: 'a1', kind: 'answer', from: 'amy', fromSid: 'amy-s', to: 'bob', toSid: 'bob-s', sdp: 'answer' });
    assert.equal(h.pcs[0].remote?.type, 'answer');
    assert.equal(h.pcs[0].candidates.length, 1);
    await h.mesh.handleSignal({ id: 'c2', kind: 'candidate', from: 'amy', fromSid: 'amy-s', to: 'bob', toSid: 'bob-s', candidate: cand(2) });
    assert.equal(h.pcs[0].candidates.length, 2);
  });

  it('keeps its own offer if the other side offered at the same moment', async () => {
    const h = harness('bob');
    h.mesh.setPeers([doc('amy', 100), doc('bob', 200)]);
    await flush();
    await h.mesh.handleSignal({ id: 'o', kind: 'offer', from: 'amy', fromSid: 'amy-s', to: 'bob', toSid: 'bob-s', sdp: 'x' });
    assert.equal(h.pcs.length, 1);
    assert.equal(h.sent.filter((s) => s.kind === 'answer').length, 0);
  });
});

describe('reporting people to the screen', () => {
  it('reports a stream and connected state', async () => {
    const h = harness('bob');
    h.mesh.setPeers([doc('amy', 100), doc('bob', 200)]);
    await flush();
    h.pcs[0].emitStream('STREAM');
    h.pcs[0].emitState('connected');
    const last = h.peerEvents.at(-1)!;
    assert.equal(last[0], 'amy');
    assert.equal(last[1]?.state, 'connected');
    assert.equal(last[1]?.stream, 'STREAM');
  });

  it('closes the connection and reports null when someone leaves', async () => {
    const h = harness('bob');
    h.mesh.setPeers([doc('amy', 100), doc('bob', 200)]);
    await flush();
    h.mesh.setPeers([doc('bob', 200)]);
    assert.equal(h.pcs[0].closed, true);
    assert.equal(h.peerEvents.at(-1)![1], null);
  });

  it('replaces the connection when someone rejoins with a new session', async () => {
    const h = harness('bob');
    h.mesh.setPeers([doc('amy', 100, 'amy-1'), doc('bob', 200)]);
    await flush();
    h.mesh.setPeers([doc('amy', 300, 'amy-2'), doc('bob', 200)]);
    await flush();
    assert.equal(h.pcs[0].closed, true);
    // amy now joined after bob, so amy offers; bob must not.
    assert.equal(h.pcs.length, 1);
    await h.mesh.handleSignal({ id: 'o', kind: 'offer', from: 'amy', fromSid: 'amy-2', to: 'bob', toSid: 'bob-s', sdp: 'x' });
    assert.equal(h.pcs.length, 2);
    assert.equal(h.sent.at(-1)!.kind, 'answer');
    assert.equal(h.sent.at(-1)!.toSid, 'amy-2');
  });

  it('drops leftover signals from a previous session', async () => {
    const h = harness('amy');
    await h.mesh.handleSignal({ id: 'o', kind: 'offer', from: 'bob', fromSid: 'bob-2', to: 'amy', toSid: 'amy-s', sdp: 'x' });
    await h.mesh.handleSignal({ id: 'late', kind: 'candidate', from: 'bob', fromSid: 'bob-1', to: 'amy', toSid: 'amy-s', candidate: cand(1) });
    assert.equal(h.pcs[0].candidates.length, 0);
  });
});

describe('failures', () => {
  it('a failed connection is closed, reported, and retried by the offering side', async () => {
    const h = harness('bob');
    h.mesh.setPeers([doc('amy', 100), doc('bob', 200)]);
    await flush();
    h.pcs[0].emitState('failed');
    assert.equal(h.pcs[0].closed, true);
    assert.equal(h.peerEvents.at(-1)![1]?.state, 'failed');
    h.runTimers();
    await flush();
    assert.equal(h.pcs.length, 2);
    assert.equal(h.sent.filter((s) => s.kind === 'offer').length, 2);
  });

  it('gives up after the retry limit', async () => {
    const h = harness('bob', 'bob-s', { maxRetries: 1 });
    h.mesh.setPeers([doc('amy', 100), doc('bob', 200)]);
    await flush();
    h.pcs[0].emitState('failed');
    h.runTimers();
    await flush();
    h.pcs[1].emitState('failed');
    h.runTimers();
    await flush();
    assert.equal(h.pcs.length, 2);
  });

  it('the answering side does not retry; it waits for a new offer', async () => {
    const h = harness('amy');
    h.mesh.setPeers([doc('amy', 100), doc('bob', 200)]);
    await h.mesh.handleSignal({ id: 'o', kind: 'offer', from: 'bob', fromSid: 'bob-s', to: 'amy', toSid: 'amy-s', sdp: 'x' });
    h.pcs[0].emitState('failed');
    h.runTimers();
    await flush();
    assert.equal(h.pcs.length, 1);
    await h.mesh.handleSignal({ id: 'o2', kind: 'offer', from: 'bob', fromSid: 'bob-s', to: 'amy', toSid: 'amy-s', sdp: 'y' });
    assert.equal(h.pcs.length, 2);
  });

  it('a link that stays disconnected past the grace period counts as failed; recovering cancels that', async () => {
    const h = harness('amy');
    await h.mesh.handleSignal({ id: 'o', kind: 'offer', from: 'bob', fromSid: 'bob-s', to: 'amy', toSid: 'amy-s', sdp: 'x' });
    h.pcs[0].emitState('disconnected');
    h.pcs[0].emitState('connected');
    h.runTimers();
    assert.equal(h.pcs[0].closed, false);
    h.pcs[0].emitState('disconnected');
    h.runTimers();
    assert.equal(h.pcs[0].closed, true);
  });

  it('close() hangs up everything and ignores later input', async () => {
    const h = harness('bob');
    h.mesh.setPeers([doc('amy', 100), doc('cat', 150), doc('bob', 200)]);
    await flush();
    h.mesh.close();
    assert.equal(h.pcs.every((pc) => pc.closed), true);
    await h.mesh.handleSignal({ id: 'o', kind: 'offer', from: 'amy', fromSid: 'amy-s', to: 'bob', toSid: 'bob-s', sdp: 'x' });
    assert.equal(h.pcs.length, 2);
  });
});
