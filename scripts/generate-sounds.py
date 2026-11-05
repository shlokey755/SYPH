#!/usr/bin/env python3
"""
generate-sounds.py
Writes SYPH's alert sounds to assets/sounds/. Every sound is synthesised here from plain sine waves, so there is nothing to
license and nothing to download. Run it again after changing a tone:

    python3 scripts/generate-sounds.py

Files (16-bit mono WAV, 22.05 kHz):
  syph_message.wav          the SYPH message tone
  msg_pop.wav               a short "pop"
  msg_drop.wav              a soft two-note drop
  incallmanager_ringtone.wav  looping incoming-call ringtone. The name is what react-native-incall-manager looks for when
                            it is asked for its bundled ringtone ("_BUNDLE_"); the expo-notifications plugin copies it
                            into the Android app as a raw resource (see app.json).
"""

import math
import os
import struct
import wave

RATE = 22050
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sounds')


def silence(seconds):
    return [0.0] * int(RATE * seconds)


def note(freq, seconds, volume=0.6, decay=5.0, harmonics=((2, 0.25), (3, 0.08)), glide_to=None, attack=0.004):
    """A struck note: a quick attack and an exponential fade, with a little harmonic content so it is not a beep."""
    n = int(RATE * seconds)
    samples = []
    phase = 0.0
    for i in range(n):
        t = i / RATE
        progress = i / max(1, n - 1)
        current = freq if glide_to is None else freq + (glide_to - freq) * progress
        phase += 2 * math.pi * current / RATE
        value = math.sin(phase)
        for multiple, weight in harmonics:
            value += weight * math.sin(phase * multiple)
        envelope = min(1.0, t / attack) * math.exp(-decay * t / seconds)
        samples.append(value * envelope * volume)
    # A short fade-out so the last sample is exactly zero (no click, and clean loops).
    tail = min(len(samples), int(RATE * 0.01))
    for i in range(tail):
        samples[-1 - i] *= i / tail
    return samples


def mix(parts):
    """Plays several (start_seconds, samples) parts over each other."""
    length = max(int(start * RATE) + len(samples) for start, samples in parts)
    out = [0.0] * length
    for start, samples in parts:
        offset = int(start * RATE)
        for i, value in enumerate(samples):
            out[offset + i] += value
    return out


def write(name, samples):
    peak = max(1e-9, max(abs(s) for s in samples))
    scale = min(1.0, 0.89 / peak)  # never clip
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    with wave.open(path, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(b''.join(struct.pack('<h', int(max(-1.0, min(1.0, s * scale)) * 32767)) for s in samples))
    print(f'{name}: {len(samples) / RATE:.2f}s, {os.path.getsize(path) // 1024} KB')


# Note frequencies (Hz)
C5, D5, E5, G5, A5, B5, C6, E6 = 523.25, 587.33, 659.25, 783.99, 880.00, 987.77, 1046.50, 1318.51

# Message tone: a rising two-note chime.
write('syph_message.wav', mix([(0.0, note(A5, 0.30, decay=5)), (0.13, note(E6, 0.42, decay=5.5))]))

# Pop: a very short blip that drops in pitch.
write('msg_pop.wav', note(720, 0.13, volume=0.7, decay=6, harmonics=((2, 0.1),), glide_to=380, attack=0.002))

# Drop: two soft notes, falling.
write('msg_drop.wav', mix([(0.0, note(G5, 0.34, decay=4.5)), (0.16, note(C5, 0.46, decay=4.5))]))


def ring_phrase():
    """The call phrase: a quick rising run, twice, so it reads as "ringing" rather than as a message."""
    run = [C5, E5, G5, C6]
    parts = []
    for repeat in range(2):
        base = repeat * 0.9
        for index, freq in enumerate(run):
            parts.append((base + index * 0.11, note(freq, 0.30, volume=0.55, decay=4.2)))
    return mix(parts)


phrase = ring_phrase()

# Looping ringtone: the phrase, then a rest, so the loop has the cadence of a phone ringing. About 3.1 s,
# which is also the length of one round of the ringing vibration pattern (BUZZ_CYCLE in src/utils/alertPrefs.ts).
write('incallmanager_ringtone.wav', phrase + silence(1.55))
