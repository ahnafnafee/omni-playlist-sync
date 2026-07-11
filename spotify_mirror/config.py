"""Constants, environment helpers, and CLI parsing."""

import argparse
import os
import random
import re
import time
from dataclasses import dataclass

AMP = "https://amp-api.music.apple.com/v1"
REQUEST_TIMEOUT = 30

DEFAULT_INTERVAL = "15m"
DEFAULT_MAX_REMOVALS = 25
DEFAULT_MAX_ADDS = 200
DEFAULT_CACHE_FILE = "apple_resolve_cache.json"
DEFAULT_SONG_CACHE_FILE = "song_cache.db"
DEFAULT_STOREFRONT = "us"
DEFAULT_SPOTIFY_REDIRECT_URI = "http://127.0.0.1:8888/callback"


def required_env(var_name):
    value = os.getenv(var_name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {var_name}")
    return value


def parse_interval(value):
    match = re.fullmatch(r"(\d+)\s*([smh]?)", str(value).strip().lower())
    if not match:
        raise ValueError(f"Invalid interval: {value!r} (use e.g. 900, 15m, 1h)")
    return int(match.group(1)) * {"s": 1, "m": 60, "h": 3600}[match.group(2) or "s"]


def polite_sleep(base):
    """Jittered pause between API calls — fixed-interval request trains are what
    rate limiters flag as robotic."""
    time.sleep(random.uniform(0.7 * base, 1.6 * base))


@dataclass
class Options:
    execute: bool
    loop: bool
    interval_s: int
    playlists: str
    max_removals: int
    max_adds: int
    download_dir: str
    storefront: str
    cache_file: str
    song_cache_file: str


def parse_args(argv=None):
    p = argparse.ArgumentParser(
        prog="spotify-mirror",
        description="Mirror Spotify playlists to same-named Apple Music and YouTube Music playlists.",
    )
    p.add_argument("--execute", action="store_true", help="Apply changes to the targets (default: dry run).")
    p.add_argument("--loop", action="store_true", help="Run forever, sleeping --interval between passes.")
    p.add_argument("--interval", default=os.getenv("SYNC_INTERVAL", DEFAULT_INTERVAL),
                   help=f"Loop sleep, e.g. 900, 15m, 1h (default: {DEFAULT_INTERVAL}).")
    p.add_argument("--playlists", default=os.getenv("PLAYLISTS", ""),
                   help="Comma-separated playlist names to sync (default: every same-named pair).")
    p.add_argument("--max-removals", type=int, default=int(os.getenv("MAX_REMOVALS", DEFAULT_MAX_REMOVALS)),
                   help=f"Per-playlist removal cap per pass; more than this skips removals (default: {DEFAULT_MAX_REMOVALS}).")
    p.add_argument("--max-adds", type=int, default=int(os.getenv("MAX_ADDS", DEFAULT_MAX_ADDS)),
                   help=f"Per-playlist additions cap per pass; the rest continue next pass (default: {DEFAULT_MAX_ADDS}).")
    p.add_argument("--download-dir", default=os.getenv("DOWNLOAD_DIR", ""),
                   help="Also mirror the paired playlists to local audio files under this folder (requires --execute).")
    p.add_argument("--storefront", default=os.getenv("APPLE_STOREFRONT", DEFAULT_STOREFRONT),
                   help=f"Apple catalog storefront (default: {DEFAULT_STOREFRONT}).")
    p.add_argument("--cache-file", default=os.getenv("APPLE_CACHE_FILE", DEFAULT_CACHE_FILE),
                   help=f"ISRC/search resolution cache (default: {DEFAULT_CACHE_FILE}).")
    p.add_argument("--song-cache-file", default=os.getenv("SONG_CACHE_FILE", DEFAULT_SONG_CACHE_FILE),
                   help=f"Ever-growing SQLite song archive (default: {DEFAULT_SONG_CACHE_FILE}).")
    a = p.parse_args(argv)

    if a.max_removals < 0:
        p.error("--max-removals must be >= 0")
    if a.max_adds < 1:
        p.error("--max-adds must be >= 1")
    return Options(
        execute=a.execute, loop=a.loop, interval_s=parse_interval(a.interval), playlists=a.playlists,
        max_removals=a.max_removals, max_adds=a.max_adds, download_dir=a.download_dir,
        storefront=a.storefront, cache_file=a.cache_file, song_cache_file=a.song_cache_file,
    )
