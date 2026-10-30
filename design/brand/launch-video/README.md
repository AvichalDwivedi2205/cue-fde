# Cue launch sting (11.2 s, 1920×1080, 30 fps)

`cue-launch.html` is the animation. `window.seek(t)` draws the frame at time `t` (seconds). There are no CSS animations, so every frame renders exactly.

The timeline follows the music bed from the old Brio launch video:

| Time | What happens |
|---|---|
| 0.5 s | "Introducing" fades in |
| 2.45 s | The green signal dot appears |
| 2.8–3.55 s | The C draws round from the dot |
| 4.48 s | Drop: a ring pulses out from the mark |
| 5.0 s | The "cue" wordmark appears |
| 6.2 s | "Customer problems in. Verified fixes out." |
| 7.7 s | "…and the growth that follows." |
| 8.3 s | The mark flies into the app tile |
| 9.4 s | The pill appears |
| 10.15 s | The signal dot pings |
| 10.45 s | Fade out |

To re-render:

```sh
npm i puppeteer-core@23        # uses the installed Google Chrome
node render.mjs preview 3.2 6.8 9.9      # stills in preview/
node render.mjs full 382                 # frames in frames_out/ (382 = with the waitlist ending)
ffmpeg -framerate 30 -i frames_out/%04d.jpg -i <music source>.mp4 -map 0:v -map 1:a \
  -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -movflags +faststart -c:a copy -shortest cue-launch-16x9.mp4
```

## Soundtrack

Chosen soundtrack: `python synth.py synthwave synthwave.wav` (original, made in code; needs numpy and scipy). The other options in `synth.py` were not chosen. Use the WAV in place of `<music source>.mp4` in the ffmpeg command above.

Waitlist ending (current): `python synth.py synthwave synthwave.wav 382`, then render 382 frames. The video is 12.7 s, and "Join the waitlist · cue.latchgrid.in" appears at 10.15 s.
