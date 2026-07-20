# Noise cancellation: local WebRTC APM (no BVC/Krisp)

## Why

The agent needs noise suppression that is **local and open-source** — explicitly **not** BVC/Krisp
(which is a LiveKit Cloud feature) and not dependent on any cloud service.

**RNNoise was investigated and rejected:** LiveKit ships no RNNoise plugin and none exists
(`livekit-plugins-rnnoise` is not a real package). The only bundled canceller is Krisp
(`noise_cancellation.NC/BVC/BVCTelephony`). Literal RNNoise would require an unofficial native binding
(`pyrnnoise` + `librnnoise`) that is fragile to build on Windows.

**Chosen solution: WebRTC APM.** `rtc.AudioProcessingModule` (part of `livekit.rtc`, already installed)
is a fully-local, open-source noise suppressor. We wrap it in a custom `rtc.FrameProcessor` and pass it
to `AudioInputOptions(noise_cancellation=...)`. Zero new dependencies, and it lets us remove the Krisp
`livekit-plugins-noise-cancellation` package entirely.

## How it works

- `AudioInputOptions.noise_cancellation` accepts a `rtc.FrameProcessor[rtc.AudioFrame]`. RoomIO calls
  `processor._process(frame)` on every input frame while `processor.enabled` is True; exceptions are
  caught by the SDK and the original frame passes through (fail-safe).
- `rtc.AudioProcessingModule(noise_suppression=True, high_pass_filter=True)` mutates a frame **in
  place** and requires **exactly-10 ms** frames.
- RoomIO delivers ~50 ms frames, so `_process` re-chunks to 10 ms with
  `AudioByteStream(rate, ch, samples_per_channel=rate // 100)`
  (`livekit.agents.utils.audio`; `.push(bytes) -> list[AudioFrame]`), runs the APM on each chunk, and
  reassembles with `rtc.combine_audio_frames`.
- `auto_gain_control` is intentionally **off** — RoomIO already applies its own AGC. Echo cancellation
  is skipped (it needs the far-end reverse stream).

## Where it lives

- `src/agent.py`: class `APMNoiseSuppression(rtc.FrameProcessor[rtc.AudioFrame])`, wired into
  `session.start()` as `room_io.AudioInputOptions(noise_cancellation=APMNoiseSuppression())`.
  Applied unconditionally — a pure local processor, safe in `console`/mock mode (no-op if there is no
  participant track), unlike the removed BVC/avatar paths.
- `tests/test_noise_suppression.py`: offline unit tests (the APM is pure DSP, no audio device needed).
- `pyproject.toml`: `livekit-plugins-noise-cancellation` dependency removed.

## Verify

```bash
uv run pytest                              # NS + no-avatar + transcript green
uv run ruff check && uv run ruff format --check
PYTHONUTF8=1 uv run python src/agent.py console   # boots, STT still transcribes (no pipeline starve)
# optional real-room check:
uv run python src/agent.py dev             # + LiveKit Agents Playground, confirm reduced background noise
```
