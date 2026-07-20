"""Tests for APMNoiseSuppression — local WebRTC noise suppression.

The WebRTC AudioProcessingModule is pure DSP (no audio device), so we exercise
the real processor offline: build int16 AudioFrames, run them through, and check
the output is shape-preserving and sane. See docs/noise-cancellation.md.

Run with: uv run pytest
"""

from pathlib import Path

import numpy as np
from livekit import rtc

import agent as agent_module
from agent import APMNoiseSuppression

AGENT_SRC = Path(agent_module.__file__).read_text(encoding="utf-8")


def _frame(samples: int, rate: int = 48000, channels: int = 1) -> rtc.AudioFrame:
    """A silent int16 PCM frame of `samples` per channel."""
    data = np.zeros(samples * channels, dtype=np.int16).tobytes()
    return rtc.AudioFrame(
        data=data,
        sample_rate=rate,
        num_channels=channels,
        samples_per_channel=samples,
    )


def test_enabled_defaults_true_and_toggles() -> None:
    p = APMNoiseSuppression()
    assert p.enabled is True
    p.enabled = False
    assert p.enabled is False


def test_process_preserves_shape_50ms_48k() -> None:
    p = APMNoiseSuppression()
    out = p._process(_frame(2400))  # 50 ms mono @ 48 kHz
    assert out.sample_rate == 48000
    assert out.num_channels == 1
    assert out.samples_per_channel == 2400


def test_process_is_rate_agnostic_16k() -> None:
    p = APMNoiseSuppression()
    out = p._process(_frame(800, rate=16000))  # 50 ms mono @ 16 kHz
    assert out.sample_rate == 16000
    assert out.samples_per_channel == 800


def test_silence_stays_silence() -> None:
    p = APMNoiseSuppression()
    out = p._process(_frame(2400))
    arr = np.frombuffer(out.data, dtype=np.int16)
    # Noise suppression on pure silence must not inject audible energy.
    assert int(np.abs(arr).max()) < 32


def test_close_does_not_raise() -> None:
    p = APMNoiseSuppression()
    p._process(_frame(2400))
    p._close()  # must not raise


def test_wired_into_audio_input() -> None:
    assert "APMNoiseSuppression(" in AGENT_SRC
    assert "noise_cancellation=" in AGENT_SRC
