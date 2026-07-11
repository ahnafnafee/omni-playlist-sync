"""Spotify — the read-only source of truth.

Only the `playlist-read-private` scope is requested; the tool never modifies
anything on Spotify. Track dicts produced here are the common currency the
mirror targets consume.
"""

import html
import os

import spotipy
from spotipy.oauth2 import SpotifyOAuth

from .config import DEFAULT_SPOTIFY_REDIRECT_URI, REQUEST_TIMEOUT, required_env


def client():
    return spotipy.Spotify(
        auth_manager=SpotifyOAuth(
            client_id=required_env("SPOTIFY_CLIENT_ID"),
            client_secret=required_env("SPOTIFY_CLIENT_SECRET"),
            redirect_uri=os.getenv("SPOTIFY_REDIRECT_URI", DEFAULT_SPOTIFY_REDIRECT_URI),
            # playlist-read-private alone keeps pre-existing token caches valid;
            # collaborative playlists aren't listed without the extra scope.
            scope="playlist-read-private",
            cache_path=os.getenv("SPOTIFY_TOKEN_CACHE", ".cache"),
            open_browser=os.getenv("SPOTIFY_OAUTH_OPEN_BROWSER", "1") != "0",
        ),
        requests_timeout=REQUEST_TIMEOUT,
        retries=3,
    )


def description(sp_playlist):
    return html.unescape(sp_playlist.get("description") or "").strip()


def playlists_by_name(sp):
    """name (casefolded) -> playlist, preferring playlists I own, then bigger."""
    me = sp.current_user()["id"]
    best = {}
    results = sp.current_user_playlists(limit=50)
    while results:
        for playlist in results.get("items", []):
            if not playlist:
                continue
            name = (playlist.get("name") or "").strip().casefold()
            if not name:
                continue
            rank = (
                (playlist.get("owner") or {}).get("id") == me,
                (playlist.get("tracks") or {}).get("total") or 0,
            )
            if name not in best or rank > best[name][0]:
                best[name] = (rank, playlist)
        results = sp.next(results) if results.get("next") else None
    return {name: playlist for name, (rank, playlist) in best.items()}


def playlist_item_track(item):
    """The track object of a playlist item, handling both the legacy shape
    ({"track": {...}}) and the current Web API shape ({"item": {...}}). Returns
    None for local files, episodes, and ghost entries."""
    track = item.get("track")
    if not isinstance(track, dict):
        track = item.get("item")
    if not isinstance(track, dict):
        return None
    if track.get("type", "track") != "track":
        return None
    if item.get("is_local") or track.get("is_local"):
        return None
    return track


def playlist_tracks(sp, playlist_id):
    tracks = []
    results = sp.playlist_items(playlist_id, market="from_token", additional_types=("track",), limit=100)
    while results:
        for item in results.get("items", []):
            track = playlist_item_track(item)
            if not track:
                continue
            artists = [a.get("name", "") for a in track.get("artists", []) if a.get("name")]
            tracks.append({
                "id": track.get("id"),
                "isrc": (track.get("external_ids") or {}).get("isrc"),
                "name": track.get("name", ""),
                "artists": artists or [""],
                "album": (track.get("album") or {}).get("name"),
                "duration_ms": track.get("duration_ms"),
                "added_at": item.get("added_at") or "",
            })
        results = sp.next(results) if results.get("next") else None
    return tracks
