"""YouTube Music target — via ytmusicapi (captured browser headers).

No ISRC, so matching is title/artist/duration only; search falls back to the
`videos` filter for the many Bangla / indie / OST tracks that live on YT as
uploads rather than catalog songs. Rate-limit / bot-detection (403/429) is
retried with exponential backoff.
"""

import os
import random
import time

from ..config import polite_sleep
from ..logs import log, log_note, log_warn
from ..matching import normalize_text, romanized, score_candidate, track_key
from .base import MirrorTarget

DEFAULT_AUTH_FILE = "ytmusic_browser.json"


def build():
    """A ready YTMusicTarget, or None (logged) when YT isn't set up."""
    auth = os.getenv("YTMUSIC_AUTH_FILE", DEFAULT_AUTH_FILE)
    if not os.path.exists(auth):
        log_note(f"YouTube Music skipped: no auth file '{auth}' "
                 "(create with: uv run ytmusicapi browser --file ytmusic_browser.json)", tag="yt")
        return None
    try:
        from ytmusicapi import YTMusic
    except ImportError:
        log_note("YouTube Music skipped: ytmusicapi not installed", tag="yt")
        return None
    try:
        return YTMusicTarget(YTMusic(auth))
    except Exception as e:
        log_warn(f"YouTube Music unavailable (re-run ytmusicapi browser setup?): {e!r}", tag="yt")
        return None


def _with_backoff(fn, what):
    for attempt in range(4):
        try:
            return fn()
        except Exception as e:
            if not any(code in str(e) for code in ("403", "429")) or attempt == 3:
                raise
            wait = 30 * (2 ** attempt) + random.uniform(0, 15)
            log(f"  rate-limited on {what}; backing off {int(wait)}s", tag="yt")
            time.sleep(wait)


def _parse_count(value):
    try:
        return int(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None


class YTMusicTarget(MirrorTarget):
    name = "YouTube Music"
    tag = "yt"
    source = "ytmusic"

    def __init__(self, yt):
        self._yt = yt
        self.cache_file = os.getenv("YTMUSIC_CACHE_FILE", "ytmusic_resolve_cache.json")

    def list_playlists(self):
        out = {}
        for pl in self._yt.get_library_playlists(limit=None) or []:
            key = (pl.get("title") or "").strip().casefold()
            if key and key not in out:
                out[key] = pl
        return out

    def playlist_count(self, playlist):
        return _parse_count(playlist.get("count"))

    def is_editable(self, playlist):
        try:
            owned = self._yt.get_playlist(playlist["playlistId"], limit=1).get("owned", True)
        except Exception:
            return True  # can't tell — let the write try and fail loudly if not
        return owned is not False

    def create(self, sp_playlist):
        from .. import spotify

        pid = _with_backoff(
            lambda: self._yt.create_playlist(sp_playlist["name"], spotify.description(sp_playlist),
                                              privacy_status="PRIVATE"),
            "create",
        )
        if isinstance(pid, dict):  # ytmusicapi sometimes returns the raw response
            pid = pid.get("playlistId") or pid.get("id")
        if not isinstance(pid, str) or not pid:
            raise RuntimeError(f"create returned {pid!r}")
        polite_sleep(2.0)  # let the new playlist settle before writing to it
        return {"playlistId": pid, "title": sp_playlist["name"], "count": "0"}

    def playlist_tracks(self, playlist):
        data = self._yt.get_playlist(playlist["playlistId"], limit=None)
        tracks = []
        for item in data.get("tracks") or []:
            if not item.get("videoId"):
                continue  # unavailable/removed video
            artists = [a.get("name", "") for a in item.get("artists") or [] if a.get("name")]
            ds = item.get("duration_seconds")
            tracks.append({
                "id": item["videoId"], "videoId": item["videoId"], "setVideoId": item.get("setVideoId"),
                "name": item.get("title", ""), "artist": ", ".join(artists), "artists": artists or [""],
                "album": (item.get("album") or {}).get("name"), "duration_ms": ds * 1000 if ds else None,
            })
        return tracks

    def track_id(self, track):
        return track.get("videoId")

    def resolve(self, track, cache):
        primary = track["artists"][0] if track["artists"] else ""
        if not f"{track['name']} {primary}".strip():
            return None, None
        key = track_key(track["name"], " ".join(track["artists"]))
        if key in cache["search"]:
            return cache["search"][key], "search"

        queries = [f"{track['name']} {primary}".strip()]
        rom = f"{romanized(track['name'])} {romanized(primary)}".strip()
        if rom and rom != normalize_text(queries[0]):
            queries.append(rom)

        best_id, best_score, method = None, -1.0, None
        for qi, query in enumerate(queries):
            for filt in ("songs", "videos"):
                try:
                    results = _with_backoff(lambda q=query, f=filt: self._yt.search(q, filter=f, limit=8), f"search {filt}")
                except Exception:
                    if filt == "songs" and qi == 0:
                        raise
                    results = []
                for cand in results or []:
                    vid = cand.get("videoId")
                    if not vid:
                        continue
                    cand_artist = ", ".join(a.get("name", "") for a in cand.get("artists") or []) or cand.get("author") or ""
                    ds = cand.get("duration_seconds")
                    score, ok = score_candidate(track["name"], track["artists"], track["duration_ms"],
                                                cand.get("title", ""), cand_artist, ds * 1000 if ds else None)
                    if ok and score > best_score:
                        best_id, best_score, method = vid, score, ("video" if filt == "videos" else "search")
                if best_id:
                    break
            if best_id:
                break

        cache["search"][key] = best_id
        cache["dirty"] = True
        polite_sleep(0.6)
        return best_id, method

    def add(self, playlist, target_ids):
        for video_id in target_ids:  # one at a time, in order — never batch
            _with_backoff(lambda v=video_id: self._yt.add_playlist_items(playlist["playlistId"], [v], duplicates=False), "add")
            polite_sleep(1.2)

    def remove(self, playlist, track):
        if not track.get("setVideoId"):
            return  # removal needs the playlist-relationship id
        _with_backoff(
            lambda: self._yt.remove_playlist_items(
                playlist["playlistId"], [{"videoId": track["videoId"], "setVideoId": track["setVideoId"]}]),
            "remove",
        )
        polite_sleep(1.2)
