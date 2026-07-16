"""Shared pytest configuration.

LiveKit imports PyAV, whose native DLL is blocked by some machine security
policies (Windows Application Control). When PyAV cannot load, importing
livekit.agents fails, which would turn every livekit-dependent test module into
a collection ERROR. To keep the suite green on such machines, we skip collecting
those modules when PyAV is unavailable. On normal machines nothing is ignored
and all tests run.
"""

collect_ignore: list[str] = []

try:
    import av  # noqa: F401
except Exception:  # ImportError incl. native DLL load failures
    collect_ignore[:] = [
        "test_agent.py",
        "test_no_avatar.py",
        "test_noise_suppression.py",
        "test_transcript.py",
        "test_training_wiring.py",
    ]
