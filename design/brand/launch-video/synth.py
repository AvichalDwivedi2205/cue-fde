"""Original sound for the Cue launch sting. Every cue is placed on the animation's timeline.

usage: python synth.py <glass|pulse|warm|minimal> out.wav
"""
import sys
import numpy as np
import scipy.signal as sg
from scipy.io import wavfile

SR = 48000
FRAMES = int(sys.argv[3]) if len(sys.argv) > 3 else 337
DUR = FRAMES / 30
N = int(SR * DUR)
rng = np.random.default_rng(11)

# Animation timeline (seconds)
T_INTRO, T_DOT, T_ARC0, T_ARC1, T_DROP = 0.45, 2.45, 2.8, 3.55, 4.48
T_LETTERS = [5.0, 5.12, 5.24]
T_TAG_A, T_TAG_B, T_MORPH, T_TILE, T_PILL, T_PING, T_FADE = 6.2, 7.72, 8.3, 8.62, 9.4, 10.15, 10.45
if FRAMES > 337:  # waitlist ending: ping lands with the URL, fade moves later
    T_PING, T_FADE = 10.55, 10.45 + (FRAMES - 337) / 30


def ts(d):
    return np.arange(int(d * SR)) / SR


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def env(d, a=0.005, dec=0.5):
    t = ts(d)
    return np.minimum(1, t / a) * np.exp(-np.maximum(0, t - a) / dec)


def ar(d, a, r):
    t = ts(d)
    return np.minimum(1, t / max(a, 1e-4)) * np.clip((d - t) / max(r, 1e-4), 0, 1)


def lp(x, fc, o=2):
    b, a = sg.butter(o, fc / (SR / 2), "low")
    return sg.lfilter(b, a, x, axis=0)


def hp(x, fc, o=2):
    b, a = sg.butter(o, fc / (SR / 2), "high")
    return sg.lfilter(b, a, x, axis=0)


def bp(x, lo, hi):
    b, a = sg.butter(2, [lo / (SR / 2), hi / (SR / 2)], "band")
    return sg.lfilter(b, a, x, axis=0)


def noise(d):
    return rng.standard_normal(int(d * SR))


class Bus:
    def __init__(self):
        self.x = np.zeros((N, 2))

    def add(self, sig, t0, gain=1.0, pan=0.0):
        if sig.ndim == 1:
            th = (pan + 1) * np.pi / 4
            sig = np.stack([sig * np.cos(th), sig * np.sin(th)], 1) * np.sqrt(2)
        i = int(t0 * SR)
        if i < 0:
            sig, i = sig[-i:], 0
        j = min(N, i + len(sig))
        if j > i:
            self.x[i:j] += gain * sig[: j - i]


def reverb(x, rt=2.2, pre=0.02, tone=6500):
    d = rt * 1.1
    t = ts(d)
    ir = np.zeros((len(t), 2))
    for c in range(2):
        n = rng.standard_normal(len(t)) * np.exp(-t * 6.9 / rt)
        ir[:, c] = lp(n, tone)
    ir[: int(pre * SR)] = 0
    ir /= np.sqrt((ir ** 2).sum(0))
    return np.stack([sg.fftconvolve(x[:, c], ir[:, c])[:N] for c in range(2)], 1)


# ---------- instruments
def fm_bell(f, d=2.6, ratio=3.5, idx=2.0, dec=0.8):
    t = ts(d)
    m = np.sin(2 * np.pi * f * ratio * t) * idx * np.exp(-t / 0.3)
    return np.sin(2 * np.pi * f * t + m) * env(d, 0.002, dec)


def soft_tone(f, d=1.8, dec=0.55, att=0.014):
    """Rounded tone: mostly sine, slow-ish attack, no metallic partials."""
    t = ts(d)
    s = np.sin(2 * np.pi * f * t) + 0.12 * np.sin(2 * np.pi * 2 * f * t) + 0.03 * np.sin(2 * np.pi * 3 * f * t)
    return lp(s * env(d, att, dec), 2800)


def soft_pop(d=0.35):
    """The signal: a low, muted drop-like pop instead of a chime."""
    t = ts(d)
    f = 170 + 330 * np.exp(-t / 0.03)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(d, 0.004, 0.085)
    return lp(s, 1400)


def signal(dry, send, t0, g=0.55):
    dry.add(soft_pop(), t0, g, 0.15)
    send.add(soft_pop(), t0, g * 0.6, 0.15)
    tone = soft_tone(midi(57), 2.2, 0.8, 0.03)
    dry.add(tone, t0 + 0.02, g * 0.22)
    send.add(tone, t0 + 0.02, g * 0.3)


def blip(f, d=0.9, dec=0.25):
    t = ts(d)
    s = np.sin(2 * np.pi * f * t) + 0.18 * np.sin(2 * np.pi * 2 * f * t) + 0.08 * np.sin(2 * np.pi * 3 * f * t)
    return lp(s * env(d, 0.002, dec), 7000)


def pluck(f, d=2.0, damp=0.997, bright=4000):
    p = int(SR / f)
    x = np.zeros(int(d * SR))
    x[:p] = lp(rng.uniform(-1, 1, p), bright)
    a = np.zeros(p + 2)
    a[0], a[p], a[p + 1] = 1, -damp * 0.5, -damp * 0.5
    y = sg.lfilter([1], a, x)
    return y / (np.abs(y).max() + 1e-9) * env(d, 0.001, d * 0.45)


def marimba(f, d=1.4):
    t = ts(d)
    s = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.5) + 0.35 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t / 0.07)
    return s * np.minimum(1, t / 0.002)


def pad(notes, d, a=1.2, r=1.2, cutoff=1800, kind="sine"):
    t = ts(d)
    s = np.zeros(len(t))
    for n in notes:
        f = midi(n)
        for det in (-0.004, 0.004):
            ff = f * (1 + det)
            if kind == "saw":
                k = np.arange(1, int(min(40, 9000 / ff)) + 1)
                s += (np.sin(2 * np.pi * np.outer(t, ff * k)) / k).sum(1) * 0.35
            else:
                s += np.sin(2 * np.pi * ff * t) + 0.15 * np.sin(2 * np.pi * 3 * ff * t)
    s = lp(s, cutoff) * ar(d, a, r)
    return s / len(notes) / 2


def kick(d=0.7, f0=120, f1=44, dec=0.3, click=0.25):
    t = ts(d)
    f = f1 + (f0 - f1) * np.exp(-t / 0.035)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(d, 0.001, dec)
    s[: int(0.004 * SR)] += click * hp(noise(0.004), 2000)
    return s


def sub_boom(d=2.2):
    t = ts(d)
    return np.sin(2 * np.pi * 42 * t) * env(d, 0.004, 0.75) + 0.6 * kick(d, 140, 40, 0.45)


def riser(d, lo=180, hi=2400):
    t = ts(d)
    k = t / d
    f = lo * (hi / lo) ** k
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25
    n = noise(d)
    air = (1 - k) * lp(n, 900) + k * lp(hp(n, 1800), 6000)
    return (tone + air * 0.6) * k ** 2.2


def rev_swell(d=1.1, cutoff=5000):
    return lp(noise(d), cutoff) * (ts(d) / d) ** 3


def whoosh(d=0.7):
    t = ts(d)
    e = np.sin(np.pi * t / d) ** 2
    return bp(noise(d), 300, 3500) * e


def tick(d=0.06, f=2200):
    t = ts(d)
    f = min(f, 1100)
    return lp(np.sin(2 * np.pi * f * t) * np.exp(-t / 0.01) * np.minimum(1, t / 0.002) + 0.25 * bp(noise(d), 800, 3000) * np.exp(-t / 0.004), 3200)


def hat(d=0.08):
    t = ts(d)
    return hp(noise(d), 7500) * np.exp(-t / 0.018)


# ---------- variants
def motif(dry, send, inst, notes, t0, g=0.5, gap=0.12, pan=0.25):
    for i, n in enumerate(notes):
        s = inst(midi(n))
        dry.add(s, t0 + i * gap, g, pan)
        send.add(s, t0 + i * gap, g * 0.9, pan)


def epiano(f, d=2.4, idx=1.1):
    """Rhodes-like: FM at ratio 1, index falling, gentle tremolo, top rolled off."""
    t = ts(d)
    m = np.sin(2 * np.pi * f * t) * idx * np.exp(-t / 0.25)
    s = np.sin(2 * np.pi * f * t + m) * env(d, 0.006, 0.9) * (1 + 0.12 * np.sin(2 * np.pi * 4.5 * t))
    return lp(s, 2600)


def ep_chord(notes, d=2.4, g=1.0):
    return sum(epiano(midi(n), d) for n in notes) / len(notes) * g


def strings(notes, d, lo=400, hi=2600, a=1.5, r=1.0):
    dark = pad(notes, d, a, r, lo, "saw")
    bright = pad(notes, d, a, r, hi, "saw")
    w = np.clip(ts(d) / max(d * 0.8, 0.1), 0, 1)
    return dark * (1 - w) + bright * w


def tom(d=1.2, f0=95, f1=58, dec=0.45):
    t = ts(d)
    f = f1 + (f0 - f1) * np.exp(-t / 0.08)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(d, 0.002, dec)
    return body + 0.15 * lp(noise(d), 900) * env(d, 0.001, 0.05)


def snare_soft(d=0.35):
    t = ts(d)
    return lp(bp(noise(d), 250, 3500) * env(d, 0.002, 0.09) + 0.6 * np.sin(2 * np.pi * 185 * t) * env(d, 0.001, 0.05), 5000)


def shaker(d=0.09):
    t = ts(d)
    return lp(bp(noise(d), 2500, 6000), 6500) * np.sin(np.pi * np.clip(t / d, 0, 1)) ** 2


def snap(d=0.12):
    t = ts(d)
    return lp(bp(noise(d), 1200, 3800) * env(d, 0.001, 0.018), 5000)


def crackle(d):
    x = np.zeros(int(d * SR))
    idx = rng.integers(0, len(x), int(d * 14))
    x[idx] = rng.uniform(-1, 1, len(idx))
    return lp(x, 2500) * 0.9 + lp(noise(d), 1800) * 0.015


def heartbeat():
    return kick(0.35, 70, 45, 0.11, 0.0) + 0.6 * np.concatenate([np.zeros(int(0.17 * SR)), kick(0.35, 65, 42, 0.1, 0.0)])[: int(0.35 * SR)]


def tri(f, d, dec=0.16):
    t = ts(d)
    k = np.arange(1, 16, 2)
    k = k[f * k < 6000]
    s = (np.sin(2 * np.pi * np.outer(t, f * k)) * ((-1) ** ((k - 1) // 2) / k ** 2)).sum(1)
    return lp(s * env(d, 0.004, dec), 2400)


def build(v):
    dry, send = Bus(), Bus()
    drop = DUR - T_DROP
    pre_chord, chord1, chord2, chord3 = [50, 57, 61, 64, 66], [45, 52, 59, 61, 64], [52, 59, 64, 68, 71], [45, 52, 56, 59, 61]

    if v == "glass":
        send.add(pad(pre_chord, T_DROP - 0.05, a=1.6, r=0.3, cutoff=1400), 0.0, 0.5)
        dry.add(pad(pre_chord, T_DROP - 0.05, a=1.6, r=0.3, cutoff=1400), 0.0, 0.25)
        signal(dry, send, T_DOT)
        dry.add(riser(T_DROP - T_ARC0 - 0.08, 300, 3000), T_ARC0, 0.22)
        send.add(rev_swell(1.3, 7000), T_DROP - 1.3, 0.35)
        dry.add(sub_boom(), T_DROP, 0.9)
        send.add(soft_tone(midi(57), 3.0, 1.2, 0.02), T_DROP, 0.35)
        for nts, a, b in ((chord1, T_DROP, T_TAG_B), (chord2, T_TAG_B, T_TILE), (chord3, T_TILE, DUR)):
            p = pad(nts, b - a + 0.6, a=0.15, r=0.6, cutoff=3200)
            dry.add(p, a, 0.32)
            send.add(p, a, 0.4)
        arp = [57, 64, 69, 71, 73, 71, 69, 64]
        for i, tt in enumerate(np.arange(T_DROP + 0.375, T_FADE + 0.4, 0.375)):
            s = soft_tone(midi(arp[i % len(arp)]), 1.2, 0.3, 0.012)
            dry.add(s, tt, 0.08, -0.35 if i % 2 else 0.35)
            send.add(s, tt, 0.1)
        for tt in T_LETTERS:
            dry.add(tick(0.06, 2600), tt, 0.10)
        for tt in (T_TAG_A, T_TAG_B):
            send.add(soft_tone(midi(64), 2.0, 0.7, 0.03), tt, 0.16)
        dry.add(whoosh(0.7), T_MORPH, 0.18, -0.3)
        dry.add(kick(0.5, 90, 50, 0.18, 0.05), T_TILE + 0.2, 0.35)
        signal(dry, send, T_PING, 0.5)
        rt = 2.8

    elif v == "pulse":
        send.add(pad(pre_chord, T_DROP - 0.05, a=2.0, r=0.2, cutoff=900, kind="saw"), 0.0, 0.35)
        dry.add(pad(pre_chord, T_DROP - 0.05, a=2.0, r=0.2, cutoff=900, kind="saw"), 0.0, 0.3)
        signal(dry, send, T_DOT)
        dry.add(riser(T_DROP - T_ARC0 - 0.06, 150, 4000), T_ARC0, 0.3)
        dry.add(sub_boom(), T_DROP, 1.0)
        dry.add(hp(noise(0.5), 3000) * env(0.5, 0.001, 0.12), T_DROP, 0.3)
        beats = np.arange(T_DROP, T_FADE + 0.3, 0.75)
        duck = np.ones(N)
        for b in beats[1:]:
            dry.add(kick(), b, 0.75)
        for b in beats:
            i = int(b * SR)
            seg = 1 - 0.6 * np.exp(-ts(0.75) / 0.12)
            duck[i:i + len(seg)] = np.minimum(duck[i:i + len(seg)], seg[: max(0, min(len(seg), N - i))])
            dry.add(lp(hat(), 9000), b + 0.375, 0.09, 0.3)
            bass = lp(pad([33 if b < T_TILE else 33], 0.7, a=0.01, r=0.25, cutoff=400, kind="saw"), 300)
            dry.add(bass * 2.2, b, 0.5)
        chords = Bus()
        for nts, a, b in ((chord1, T_DROP, T_TAG_B), (chord2, T_TAG_B, T_TILE), (chord3, T_TILE, DUR)):
            chords.add(pad(nts, b - a + 0.4, a=0.05, r=0.4, cutoff=2600, kind="saw"), a, 0.55)
        chords.x *= duck[:, None]
        dry.x += chords.x * 0.6
        send.x += chords.x * 0.35
        for tt in T_LETTERS:
            dry.add(tick(0.05, 3200), tt, 0.14)
        for tt in (T_TAG_A, T_TAG_B):
            send.add(soft_tone(midi(64), 1.4, 0.4, 0.02), tt, 0.16)
        dry.add(whoosh(0.7), T_MORPH, 0.25, -0.3)
        signal(dry, send, T_PING, 0.5)
        rt = 1.8

    elif v == "warm":
        send.add(pad([n - 12 for n in pre_chord], T_DROP - 0.05, a=1.5, r=0.3, cutoff=900), 0.0, 0.55)
        dry.add(pad([n - 12 for n in pre_chord], T_DROP - 0.05, a=1.5, r=0.3, cutoff=900), 0.0, 0.3)
        signal(dry, send, T_DOT)
        dry.add(riser(T_DROP - T_ARC0 - 0.08, 200, 1800) * 0.8, T_ARC0, 0.18)
        dry.add(kick(0.9, 100, 45, 0.4, 0.08), T_DROP, 0.8)
        for i, n in enumerate(chord1):
            s = pluck(midi(n), 2.5, 0.998, 2200)
            dry.add(s, T_DROP + i * 0.025, 0.22, -0.5 + i * 0.25)
            send.add(s, T_DROP + i * 0.025, 0.2)
        for nts, a, b in ((chord1, T_DROP, T_TAG_B), (chord2, T_TAG_B, T_TILE), (chord3, T_TILE, DUR)):
            p = pad(nts, b - a + 0.6, a=0.3, r=0.6, cutoff=1600)
            dry.add(p, a, 0.3)
            send.add(p, a, 0.3)
        arp = [57, 64, 69, 71, 73, 71, 69, 64]
        for i, tt in enumerate(np.arange(T_DROP + 0.75, T_FADE + 0.4, 0.375)):
            s = lp(marimba(midi(arp[i % len(arp)])), 2600)
            dry.add(s, tt, 0.13, -0.35 if i % 2 else 0.35)
            send.add(s, tt, 0.1)
        for b in np.arange(T_DROP + 1.5, T_FADE, 1.5):
            dry.add(kick(0.6, 90, 48, 0.25, 0.03), b, 0.4)
        for tt in T_LETTERS:
            dry.add(lp(marimba(midi(69), 0.4), 2400), tt, 0.07)
        dry.add(whoosh(0.7), T_MORPH, 0.12, -0.3)
        signal(dry, send, T_PING, 0.5)
        rt = 2.2


    elif v == "cinematic":
        st = strings([n - 12 for n in pre_chord], T_DROP + 0.2, 300, 1500, 2.2, 0.4)
        dry.add(st, 0.0, 0.45)
        send.add(st, 0.0, 0.4)
        dry.add(tom(1.6, 80, 50, 0.6), T_DOT, 0.55)
        send.add(tom(1.6, 80, 50, 0.6), T_DOT, 0.3)
        dry.add(tom(1.2, 90, 55, 0.4), T_ARC1, 0.4)
        dry.add(lp(riser(T_DROP - T_ARC0 - 0.1, 120, 1600), 4000), T_ARC0, 0.25)
        send.add(rev_swell(1.4, 3500), T_DROP - 1.4, 0.45)
        dry.add(sub_boom(2.8), T_DROP, 1.0)
        dry.add(tom(2.0, 75, 45, 0.9), T_DROP, 0.6)
        for nts, a, b in ((chord1, T_DROP, T_TAG_B), (chord2, T_TAG_B, T_TILE), (chord3, T_TILE, DUR)):
            st = strings(nts, b - a + 0.8, 600, 2400, 0.25, 0.8)
            dry.add(st, a, 0.4)
            send.add(st, a, 0.45)
        for tt in T_LETTERS:
            dry.add(lp(pluck(midi(45), 0.6, 0.995, 900), 700), tt, 0.25)
        dry.add(tom(1.2, 85, 52, 0.4), T_TAG_A, 0.35)
        dry.add(tom(1.2, 85, 52, 0.4), T_TAG_B, 0.35)
        dry.add(whoosh(0.7), T_MORPH, 0.2, -0.3)
        dry.add(tom(1.4, 80, 48, 0.5), T_TILE + 0.2, 0.5)
        dry.add(tom(1.6, 80, 50, 0.6), T_PING, 0.45)
        rt = 3.6

    elif v == "lofi":
        dry.add(crackle(DUR), 0.0, 0.5)
        for i, tt in enumerate(np.arange(0.3, T_DROP - 0.2, 1.5)):
            c = ep_chord(pre_chord if i % 2 == 0 else [n - 2 for n in pre_chord], 1.8)
            dry.add(c, tt, 0.35 * min(1, 0.4 + i * 0.25))
            send.add(c, tt, 0.25)
        dry.add(epiano(midi(57), 2.0), T_DOT, 0.35)
        send.add(epiano(midi(57), 2.0), T_DOT, 0.25)
        dry.add(lp(riser(T_DROP - T_ARC0 - 0.12, 150, 1500), 3500), T_ARC0, 0.18)
        dry.add(kick(0.8, 100, 46, 0.32, 0.05), T_DROP, 0.85)
        beats = np.arange(T_DROP, T_FADE + 0.3, 0.75)
        for j, b in enumerate(beats):
            if j:
                dry.add(kick(0.6, 95, 48, 0.24, 0.03), b, 0.6)
            if j % 2 == 1:
                dry.add(snare_soft(), b + 0.03, 0.32)
                send.add(snare_soft(), b + 0.03, 0.12)
            dry.add(shaker(), b + 0.375, 0.12, 0.35)
        for nts, a, b in ((chord1, T_DROP, T_TAG_B), (chord2, T_TAG_B, T_TILE), (chord3, T_TILE, DUR)):
            for tt in np.arange(a, b, 1.5):
                c = ep_chord(nts, 2.0)
                dry.add(c, tt, 0.4)
                send.add(c, tt, 0.25)
        dry.add(whoosh(0.7), T_MORPH, 0.12, -0.3)
        dry.add(epiano(midi(64), 2.0), T_PING, 0.3)
        rt = 1.6

    elif v == "heartbeat":
        p0 = pad([n - 12 for n in pre_chord], T_DROP, a=2.5, r=0.2, cutoff=700)
        dry.add(p0, 0.0, 0.3)
        send.add(p0, 0.0, 0.3)
        tt, gap = 0.7, 0.95
        while tt < T_DROP - 0.3:
            dry.add(heartbeat(), tt, 0.35 + 0.45 * tt / T_DROP)
            tt += gap
            gap = max(0.55, gap * 0.93)
        signal(dry, send, T_DOT, 0.4)
        send.add(rev_swell(1.2, 3000), T_DROP - 1.2, 0.35)
        dry.add(sub_boom(2.6), T_DROP, 1.0)
        for nts, a, b in ((chord1, T_DROP, T_TAG_B), (chord2, T_TAG_B, T_TILE), (chord3, T_TILE, DUR)):
            p = pad(nts, b - a + 0.8, a=0.4, r=0.8, cutoff=2200)
            dry.add(p, a, 0.35)
            send.add(p, a, 0.45)
        for tt in np.arange(T_DROP + 1.5, T_FADE, 1.5):
            dry.add(heartbeat(), tt, 0.35)
        for tt in T_LETTERS:
            dry.add(tick(0.05, 900), tt, 0.08)
        dry.add(whoosh(0.7), T_MORPH, 0.15, -0.3)
        dry.add(heartbeat(), T_PING - 0.1, 0.45)
        rt = 2.6

    elif v == "ambient":
        t = ts(DUR)
        lfo = 0.5 + 0.5 * np.sin(2 * np.pi * 0.11 * t)
        dr = pad([38, 45, 52], DUR, a=2.0, r=1.0, cutoff=500) * (0.6 + 0.4 * lfo)
        dry.add(dr, 0.0, 0.45)
        send.add(dr, 0.0, 0.35)
        sw = pad([57, 64, 69], 2.4, a=0.9, r=1.4, cutoff=1600)
        send.add(sw, T_DOT - 0.2, 0.5)
        dry.add(sw, T_DOT - 0.2, 0.15)
        send.add(rev_swell(1.8, 2500), T_DROP - 1.8, 0.5)
        dry.add(lp(sub_boom(3.0), 300), T_DROP, 0.7)
        for nts, a, b in ((chord1, T_DROP, T_TAG_B), (chord2, T_TAG_B, T_TILE), (chord3, T_TILE, DUR)):
            p = pad(nts, b - a + 1.2, a=0.6, r=1.2, cutoff=1800)
            dry.add(p, a, 0.3)
            send.add(p, a, 0.6)
        for i, tt in enumerate(T_LETTERS):
            send.add(soft_tone(midi([57, 61, 64][i]), 1.6, 0.6, 0.03), tt, 0.12)
        send.add(whoosh(1.0), T_MORPH - 0.15, 0.18)
        send.add(soft_tone(midi(57), 3.0, 1.2, 0.05), T_PING, 0.25)
        rt = 4.2

    elif v.startswith("synthwave"):
        fx = v == "synthwave"
        snare_on = v != "synthwave_nosnare"
        arp_pre = [50, 57, 62, 57, 64, 57, 62, 57]
        for i, tt in enumerate(np.arange(0.4, T_DROP - 0.1, 0.1875)):
            g = 0.06 + 0.12 * (tt / T_DROP) ** 2
            dry.add(tri(midi(arp_pre[i % 8]), 0.3), tt, g, -0.3 if i % 2 else 0.3)
            send.add(tri(midi(arp_pre[i % 8]), 0.3), tt, g * 0.6)
        if fx:
            signal(dry, send, T_DOT, 0.45)
            dry.add(lp(riser(T_DROP - T_ARC0 - 0.08, 150, 2500), 5000), T_ARC0, 0.25)
            dry.add(sub_boom(), T_DROP, 0.95)
        else:
            # Musical build instead of effects: a saw pad that opens up into the drop.
            sw = strings(pre_chord, T_DROP - T_DOT, 300, 2200, 1.4, 0.05)
            dry.add(sw, T_DOT, 0.3)
            send.add(sw, T_DOT, 0.2)
            dry.add(kick(0.9, 110, 44, 0.38, 0.04), T_DROP, 0.9)
        beats = np.arange(T_DROP, T_FADE + 0.3, 0.75)
        duck = np.ones(N)
        for j, b in enumerate(beats):
            if j:
                dry.add(kick(0.6, 110, 46, 0.26, 0.05), b, 0.65)
            if j % 2 == 1 and snare_on:
                dry.add(snare_soft(0.45), b, 0.3)
                send.add(snare_soft(0.45), b, 0.25)
            i0 = int(b * SR)
            seg = 1 - 0.55 * np.exp(-ts(0.75) / 0.14)
            n0 = max(0, min(len(seg), N - i0))
            duck[i0:i0 + n0] = np.minimum(duck[i0:i0 + n0], seg[:n0])
        arp_post = [57, 64, 69, 71, 73, 71, 69, 64]
        for i, tt in enumerate(np.arange(T_DROP, T_FADE + 0.3, 0.1875)):
            dry.add(tri(midi(arp_post[i % 8]), 0.3), tt, 0.12, -0.3 if i % 2 else 0.3)
        chords = Bus()
        for nts, a, b in ((chord1, T_DROP, T_TAG_B), (chord2, T_TAG_B, T_TILE), (chord3, T_TILE, DUR)):
            chords.add(pad(nts, b - a + 0.4, a=0.05, r=0.4, cutoff=2000, kind="saw"), a, 0.5)
            chords.add(lp(pad([nts[0] - 12], b - a + 0.2, a=0.01, r=0.2, cutoff=300, kind="saw"), 250) * 2.0, a, 0.5)
        chords.x *= duck[:, None]
        dry.x += chords.x * 0.6
        send.x += chords.x * 0.3
        if fx:
            dry.add(whoosh(0.7), T_MORPH, 0.2, -0.3)
            signal(dry, send, T_PING, 0.45)
        rt = 2.0

    elif v == "snap":
        p0 = pad(pre_chord, T_DROP, a=1.8, r=0.2, cutoff=1200)
        dry.add(p0, 0.0, 0.25)
        send.add(p0, 0.0, 0.3)
        for tt in np.arange(T_DOT, T_DROP - 0.3, 0.75):
            dry.add(snap(), tt + 0.375, 0.25, 0.25)
            send.add(snap(), tt + 0.375, 0.15)
        signal(dry, send, T_DOT, 0.45)
        dry.add(lp(riser(T_DROP - T_ARC0 - 0.1, 150, 1800), 4000), T_ARC0, 0.18)
        dry.add(kick(0.8, 105, 46, 0.3, 0.05), T_DROP, 0.85)
        bassline = [33, 33, 40, 38, 33, 33, 40, 36]
        beats = np.arange(T_DROP, T_FADE + 0.3, 0.375)
        for j, b in enumerate(beats):
            if j % 2 == 0 and j:
                dry.add(kick(0.6, 100, 48, 0.24, 0.03), b, 0.55)
            if j % 4 == 2:
                dry.add(snap(), b, 0.32, -0.2)
                dry.add(snap(), b + 0.012, 0.22, 0.25)
                send.add(snap(), b, 0.2)
            bs = lp(pluck(midi(bassline[j % 8]), 0.5, 0.993, 700), 600)
            dry.add(bs, b, 0.55)
        for nts, a, b in ((chord1, T_DROP, T_TAG_B), (chord2, T_TAG_B, T_TILE), (chord3, T_TILE, DUR)):
            p = pad(nts, b - a + 0.5, a=0.08, r=0.5, cutoff=1800)
            dry.add(p, a, 0.28)
            send.add(p, a, 0.3)
        dry.add(whoosh(0.7), T_MORPH, 0.15, -0.3)
        signal(dry, send, T_PING, 0.45)
        rt = 1.8

    else:  # minimal: sound design only
        t = ts(DUR)
        drone = (np.sin(2 * np.pi * 55 * t) + 0.5 * np.sin(2 * np.pi * 82.4 * t)) * 0.18
        drone *= np.minimum(1, t / 1.5)
        dry.add(lp(drone, 300), 0.0, 0.6)
        signal(dry, send, T_DOT, 0.6)
        dry.add(riser(T_DROP - T_ARC0 - 0.12, 200, 3200), T_ARC0, 0.25)
        send.add(rev_swell(1.4, 6000), T_DROP - 1.4, 0.4)
        dry.add(sub_boom(), T_DROP, 1.0)
        send.add(hp(noise(1.6), 1500) * env(1.6, 0.002, 0.4), T_DROP, 0.25)
        for tt in T_LETTERS:
            dry.add(tick(0.06, 2400), tt, 0.13)
        for tt in (T_TAG_A, T_TAG_B):
            send.add(soft_tone(midi(57), 2.0, 0.9, 0.03), tt, 0.16)
        dry.add(whoosh(0.7), T_MORPH, 0.22, -0.3)
        dry.add(kick(0.5, 90, 50, 0.2, 0.05), T_TILE + 0.2, 0.4)
        dry.add(tick(0.05, 1800), T_PILL, 0.1)
        signal(dry, send, T_PING, 0.55)
        rt = 3.0

    mix = dry.x + reverb(send.x, rt) * 0.9
    mix = lp(hp(mix, 28), 9500)
    tt = np.arange(N) / SR
    fade = np.clip((DUR - 0.05 - tt) / (DUR - 0.05 - (T_FADE + 0.2)), 0, 1)
    mix *= np.where(tt > T_FADE + 0.2, fade, 1.0)[:, None]
    mix /= np.abs(mix).max()
    mix = np.tanh(mix * 1.6) / np.tanh(1.6)
    mix *= 10 ** (-1.0 / 20) / np.abs(mix).max()
    return mix


if __name__ == "__main__":
    v, out = sys.argv[1], sys.argv[2]
    m = build(v)
    rms = 20 * np.log10(np.sqrt((m ** 2).mean()))
    print(v, "peak dBFS %.1f" % (20 * np.log10(np.abs(m).max())), "rms dBFS %.1f" % rms)
    wavfile.write(out, SR, (m * 32767).astype(np.int16))
