"""Mirror targets: destinations a Spotify playlist is mirrored to.

Add a service by subclassing MirrorTarget (see base.py) and appending its
builder to `build_targets`.
"""

from .apple import AppleMusicTarget
from .base import MirrorTarget, TargetAuthError, mirror_pair
from . import ytmusic

__all__ = ["AppleMusicTarget", "MirrorTarget", "TargetAuthError", "mirror_pair", "build_targets"]


def build_targets(opts):
    """Every target that is configured/available this run, in order. Apple is
    built from env tokens; YouTube Music only if its auth file exists."""
    from ..config import required_env
    from ..logs import log_note

    targets = []
    try:
        required_env("APPLE_BEARER_TOKEN")
        required_env("APPLE_USER_TOKEN")
        targets.append(AppleMusicTarget(opts.storefront, opts.cache_file))
    except RuntimeError as e:
        log_note(f"Apple Music skipped: {e}", tag="apple")

    yt = ytmusic.build()
    if yt:
        targets.append(yt)
    return targets
