"""Mirror Spotify playlists to same-named Apple Music library playlists.

Spotify is the source of truth. Each pass makes every paired Apple playlist
match its Spotify twin: missing tracks are appended (oldest added_at first,
so the most recently added lands last), tracks gone from Spotify are removed.
Pairs are discovered by case-insensitive playlist name; playlists that exist
on only one side are skipped.

Writes to Apple go through amp-api.music.apple.com (the web player's API),
authenticated with the captured web-player tokens -the same ones this
project has always used.
"""

import argparse
import html
import json
import os
import random
import re
import sys
import threading
import time
import unicodedata
from datetime import datetime
from difflib import SequenceMatcher

import requests
import spotipy
from anyascii import anyascii
from dotenv import load_dotenv
from rapidfuzz import fuzz
from rapidfuzz.distance import JaroWinkler
from spotipy.oauth2 import SpotifyOAuth

import song_cache

load_dotenv()

# Windows pipes/consoles default to cp1252; track titles are arbitrary Unicode.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

AMP = "https://amp-api.music.apple.com/v1"
DEFAULT_INTERVAL = "15m"
DEFAULT_MAX_REMOVALS = 25
DEFAULT_MAX_ADDS = 200
DEFAULT_CACHE_FILE = "apple_resolve_cache.json"
DEFAULT_SONG_CACHE_FILE = "song_cache.db"
DEFAULT_STOREFRONT = "us"
DEFAULT_SPOTIFY_REDIRECT_URI = "http://127.0.0.1:8888/callback"
FUZZY_THRESHOLD = 0.92
DURATION_TOLERANCE_MS = 2500
REQUEST_TIMEOUT = 30


def log(message):
    print(f"[{datetime.now():%H:%M:%S}] {message}", flush=True)


def polite_sleep(base):
    """Jittered pause between API calls - fixed-interval request trains are
    what rate limiters flag as robotic."""
    time.sleep(random.uniform(0.7 * base, 1.6 * base))


def required_env(var_name):
    value = os.getenv(var_name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {var_name}")
    return value


def normalize_text(value):
    """Unicode-aware: keeps letters/digits in ANY script (Cyrillic, CJK,
    Bengali, ...) - a Latin-only character class silently turns non-Latin
    titles into empty strings, which breaks matching and deletes real tracks."""
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKC", str(value)).casefold()
    normalized = re.sub(r"[\W_]+", " ", normalized)
    return " ".join(normalized.split())


PAREN_FEAT_RE = re.compile(r"[\(\[]\s*(feat|featuring|ft|with)\b.*?[\)\]]", re.IGNORECASE)
TRAILING_FEAT_RE = re.compile(r"\s+(feat|featuring|ft)\s+.*$")


def loose_name(name):
    """Track title with feat-clauses stripped -'(feat. X)' is the classic
    Spotify/Apple metadata drift for the SAME song. Version qualifiers like
    (Live)/(Acoustic) are kept: those are different tracks."""
    cleaned = TRAILING_FEAT_RE.sub("", normalize_text(PAREN_FEAT_RE.sub(" ", name or ""))).strip()
    return cleaned or normalize_text(name)


def track_key(name, artist):
    return f"{loose_name(name)}|{normalize_text(artist)}"


def fuzzy_in(key, keys, threshold=FUZZY_THRESHOLD):
    # ponytail: O(len(keys)) SequenceMatcher scan per unmatched track; fine for
    # playlist-sized sets, index it if someone mirrors a 50k-track monster.
    return any(SequenceMatcher(None, key, k).ratio() >= threshold for k in keys)


def romanized(text):
    """ASCII romanization for cross-script matching (Камин->kamin, ত্রি->tri).
    Cyrillic / Bengali / Greek / Arabic romanize reliably; CJK yields a Chinese
    reading, so kanji/kana titles stay best-effort."""
    return normalize_text(anyascii(str(text or "")))


def _name_variants(text):
    return {v for v in (loose_name(text), romanized(text)) if v}


def _sim_strict(a, b):
    """0..1 similarity that PENALIZES extra words on either side (token_sort),
    with a Jaro-Winkler floor for short strings and transliteration near-misses
    ("nesar" vs "neshar"). Rejects different versions (Live/Piano/Remix) whose
    titles carry extra words, so it gates acceptance when duration can't."""
    if not a or not b:
        return 0.0
    return max(fuzz.token_sort_ratio(a, b) / 100.0, JaroWinkler.normalized_similarity(a, b))


def _sim_loose(a, b):
    """0..1 token-set similarity: order-, subset- and decoration-tolerant. High
    when one string's tokens are a subset of the other's — multi-artist credits
    ("Arijit Singh" ⊂ "Arijit Singh, Ved Sharma, ...") and decorated titles
    ("Tri" ⊂ "Popeye - Tri (ত্রি) Official Music Video"). Powerful but only
    trusted for titles when the duration corroborates the match."""
    if not a or not b:
        return 0.0
    return fuzz.token_set_ratio(a, b) / 100.0


def _best(sim, q_variants, c_variants):
    return max((sim(a, b) for a in q_variants for b in c_variants if a and b), default=0.0)


def score_candidate(name, artists, duration_ms, cand_name, cand_artist, cand_duration_ms):
    """(score in 0..1, acceptable) for a search-result candidate vs the wanted
    track — the fuzzy fallback when no ISRC/link resolves it. RapidFuzz
    token-set matching tolerates word order, multi-artist credits, and title
    decoration; romanized variants fold script differences; the duration anchor
    unlocks the looser title match so covers / different versions are rejected
    when duration disagrees. See the matching notes in the README."""
    if isinstance(artists, str):
        artists = [artists]
    q_names, c_names = _name_variants(name), _name_variants(cand_name)
    name_strict = _best(_sim_strict, q_names, c_names)
    name_loose = _best(_sim_loose, q_names, c_names)

    joined = " ".join(artists)
    q_art = {normalize_text(joined), romanized(joined)}
    c_art = {normalize_text(cand_artist), romanized(cand_artist)}
    artist_sim = _best(_sim_loose, q_art, c_art)  # subset-tolerant: services list the primary artist

    if duration_ms is not None and cand_duration_ms is not None:
        delta = abs(duration_ms - cand_duration_ms)
        duration_score = max(0.0, 1.0 - delta / (DURATION_TOLERANCE_MS * 4))
        duration_close = delta <= DURATION_TOLERANCE_MS
    else:
        duration_score, duration_close = 0.5, False

    # Loose (decoration/subset) title match is trusted only with duration
    # corroboration; otherwise fall back to the length-sensitive strict score.
    name_sim = max(name_strict, name_loose) if duration_close else name_strict
    score = 0.45 * name_sim + 0.35 * artist_sim + 0.20 * duration_score
    strong = duration_close and name_sim >= 0.78 and artist_sim >= 0.58
    fuzzy = name_strict >= 0.88 and artist_sim >= 0.60
    return score, (strong or fuzzy)


def parse_interval(value):
    match = re.fullmatch(r"(\d+)\s*([smh]?)", str(value).strip().lower())
    if not match:
        raise ValueError(f"Invalid interval: {value!r} (use e.g. 900, 15m, 1h)")
    return int(match.group(1)) * {"s": 1, "m": 60, "h": 3600}[match.group(2) or "s"]


def chunks(seq, size):
    for i in range(0, len(seq), size):
        yield seq[i : i + size]


# -- Apple Music (amp-api, web-player tokens) ----------------------------------
class AppleAuthError(RuntimeError):
    pass


def apple_headers():
    bearer = required_env("APPLE_BEARER_TOKEN")
    if bearer.lower().startswith("bearer "):
        bearer = bearer[7:]
    return {
        "Authorization": f"Bearer {bearer}",
        "Media-User-Token": required_env("APPLE_USER_TOKEN"),
        "Origin": "https://music.apple.com",
        "Referer": "https://music.apple.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:148.0) Gecko/20100101 Firefox/148.0",
    }


def apple_request(method, url, headers, *, params=None, json_body=None, ok404=False):
    """One amp-api call. GETs retry on 5xx/network; 429s back off and retry on
    every method (a rate-limited call was never executed); other mutation
    failures are single-shot - a lost add/remove self-heals on the next
    stateless pass, while a blindly retried one could double-apply."""
    attempts = 4
    for attempt in range(attempts):
        try:
            r = requests.request(
                method, url, headers=headers, params=params, json=json_body, timeout=REQUEST_TIMEOUT
            )
        except requests.RequestException:
            if method != "GET" or attempt >= 2:
                raise
            time.sleep(2 * (attempt + 1))
            continue
        if r.status_code in (401, 403):
            raise AppleAuthError(
                f"Apple rejected {method} {url.split('/v1/')[-1]} ({r.status_code}). "
                "Re-capture APPLE_BEARER_TOKEN / APPLE_USER_TOKEN from music.apple.com DevTools."
            )
        if r.status_code == 404 and ok404:
            return None
        if r.status_code == 429 and attempt < attempts - 1:
            wait = float(r.headers.get("Retry-After") or 20) + random.uniform(1, 8)
            log(f"  rate-limited by Apple; waiting {int(wait)}s")
            time.sleep(wait)
            continue
        if r.status_code >= 500 and method == "GET" and attempt < 2:
            time.sleep(2 * (attempt + 1))
            continue
        r.raise_for_status()
        return r
    return None


def apple_library_playlists(headers):
    playlists, offset = [], 0
    while True:
        r = apple_request(
            "GET", f"{AMP}/me/library/playlists", headers, params={"limit": 100, "offset": offset}
        )
        data = r.json()
        playlists.extend(data.get("data", []))
        if "next" not in data:
            return playlists
        offset += 100


def apple_playlist_tracks(headers, playlist_id):
    """Playlist entries: relationship_id (needed to remove), catalog_id, name,
    artist, duration_ms. Empty playlists 404 on this endpoint -that's empty,
    not an error."""
    tracks, offset = [], 0
    while True:
        r = apple_request(
            "GET",
            f"{AMP}/me/library/playlists/{playlist_id}/tracks",
            headers,
            params={"limit": 100, "offset": offset},
            ok404=True,
        )
        if r is None:
            return tracks
        data = r.json()
        for t in data.get("data", []):
            attrs = t.get("attributes", {})
            play_params = attrs.get("playParams", {})
            tracks.append(
                {
                    "relationship_id": t.get("id"),
                    "catalog_id": play_params.get("catalogId") or play_params.get("id"),
                    "name": attrs.get("name", ""),
                    "artist": attrs.get("artistName", ""),
                    "album": attrs.get("albumName"),
                    "duration_ms": attrs.get("durationInMillis"),
                }
            )
        if "next" not in data:
            return tracks
        offset += 100


def apple_songs_by_isrc(headers, storefront, isrcs, cache):
    """Resolve ISRCs to Apple catalog song candidates via filter[isrc].
    Results (including empty ones) are cached forever -ISRCs don't change."""
    missing = [i for i in isrcs if i not in cache["isrc"]]
    for chunk in chunks(missing, 25):
        r = apple_request(
            "GET",
            f"{AMP}/catalog/{storefront}/songs",
            headers,
            params={"filter[isrc]": ",".join(chunk)},
        )
        found = {}
        for song in r.json().get("data", []):
            attrs = song.get("attributes", {})
            isrc = attrs.get("isrc")
            if isrc:
                found.setdefault(isrc, []).append(
                    {
                        "id": song.get("id"),
                        "name": attrs.get("name", ""),
                        "artist": attrs.get("artistName", ""),
                        "duration_ms": attrs.get("durationInMillis"),
                    }
                )
        for isrc in chunk:
            cache["isrc"][isrc] = found.get(isrc, [])
        cache["dirty"] = True
        polite_sleep(0.25)


def _apple_search_once(headers, storefront, term, name, artists, duration_ms):
    r = apple_request(
        "GET",
        f"{AMP}/catalog/{storefront}/search",
        headers,
        params={"term": term, "types": "songs", "limit": 10, "l": "en-us"},
    )
    best_id, best_score = None, -1.0
    for song in r.json().get("results", {}).get("songs", {}).get("data", []):
        attrs = song.get("attributes", {})
        score, acceptable = score_candidate(
            name, artists, duration_ms,
            attrs.get("name", ""), attrs.get("artistName", ""), attrs.get("durationInMillis"),
        )
        if acceptable and score > best_score:
            best_score, best_id = score, song.get("id")
    return best_id


def apple_search_song(headers, storefront, name, artists, duration_ms, cache):
    """Fallback when a Spotify track has no usable ISRC match: score the Apple
    catalog search results. Searches by primary artist (services index the
    primary, not the full feature credit), then retries with a romanized query
    for non-Latin titles. Misses are cached as None -delete the cache file to
    retry them."""
    if isinstance(artists, str):
        artists = [artists]
    primary = artists[0] if artists else ""
    if not f"{name} {primary}".strip():
        return None  # nothing to search for; amp-api 400s on an empty term
    key = track_key(name, " ".join(artists))
    if key in cache["search"]:
        return cache["search"][key]

    best_id = _apple_search_once(headers, storefront, f"{name} {primary}".strip(), name, artists, duration_ms)
    if not best_id:
        rom = f"{romanized(name)} {romanized(primary)}".strip()
        if rom and rom != normalize_text(f"{name} {primary}"):
            polite_sleep(0.3)
            best_id = _apple_search_once(headers, storefront, rom, name, artists, duration_ms)

    cache["search"][key] = best_id
    cache["dirty"] = True
    polite_sleep(0.3)
    return best_id


def spotify_description(sp_playlist):
    return html.unescape(sp_playlist.get("description") or "").strip()


def apple_create_playlist(headers, sp_playlist):
    """Create a library playlist named/described like the Spotify one. Cover
    art can't be copied - neither service exposes artwork upload; both
    generate their own mosaic covers from the tracks."""
    attributes = {"name": sp_playlist.get("name", "")}
    description = spotify_description(sp_playlist)
    if description:
        attributes["description"] = description
    r = apple_request(
        "POST", f"{AMP}/me/library/playlists", headers, json_body={"attributes": attributes}
    )
    return r.json()["data"][0]


def apple_add_tracks(headers, playlist_id, catalog_ids):
    """Append catalog songs strictly one POST per track, in order — batched
    arrays can land out of order on Apple's side, and append order is what
    keeps the playlist sorted by date added."""
    for catalog_id in catalog_ids:
        apple_request(
            "POST",
            f"{AMP}/me/library/playlists/{playlist_id}/tracks",
            headers,
            json_body={"data": [{"id": catalog_id, "type": "songs"}]},
        )
        polite_sleep(0.4)


def apple_remove_track(headers, playlist_id, relationship_id):
    """The web player's real per-track removal call."""
    apple_request(
        "DELETE",
        f"{AMP}/me/library/playlists/{playlist_id}/tracks",
        headers,
        params={"ids[library-songs]": relationship_id, "mode": "all"},
    )
    polite_sleep(0.4)


# -- Spotify (read-only) --------------------------------------------------------
def spotify_client():
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


def spotify_playlists_by_name(sp):
    """name (casefolded) -> playlist, preferring playlists I own, then bigger ones."""
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
    """The track object of a playlist item. Handles both the legacy shape
    ({"track": {...}}) and the current Web API shape ({"item": {...}}).
    Returns None for local files, episodes, and ghost entries."""
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


def spotify_playlist_tracks(sp, playlist_id):
    tracks = []
    results = sp.playlist_items(playlist_id, market="from_token", additional_types=("track",), limit=100)
    while results:
        for item in results.get("items", []):
            track = playlist_item_track(item)
            if not track:
                continue
            artists = [a.get("name", "") for a in track.get("artists", []) if a.get("name")]
            tracks.append(
                {
                    "id": track.get("id"),
                    "isrc": (track.get("external_ids") or {}).get("isrc"),
                    "name": track.get("name", ""),
                    "artists": artists or [""],
                    "album": (track.get("album") or {}).get("name"),
                    "duration_ms": track.get("duration_ms"),
                    "added_at": item.get("added_at") or "",
                }
            )
        results = sp.next(results) if results.get("next") else None
    return tracks


# -- Diff -----------------------------------------------------------------------
def spotify_track_keys(track):
    keys = {track_key(track["name"], artist) for artist in track["artists"]}
    keys.add(track_key(track["name"], " ".join(track["artists"])))
    return keys


def compute_diff(sp_tracks, ap_tracks, isrc_candidates, links=None, threshold=FUZZY_THRESHOLD):
    """Pure diff. Returns (to_add, to_remove).

    links: {spotify_id: apple_catalog_id} from previous successful matches —
    a hard identifier beats ISRC candidates and keys on both diff sides.

    to_add: Spotify tracks absent from Apple (no catalog-id candidate present,
    no exact title|artist key match), sorted by added_at ascending so appending
    keeps the most recently added track last.
    to_remove: Apple entries whose catalog id isn't a candidate of any Spotify
    track AND whose key has no exact or fuzzy Spotify match -fuzzy applies
    only to this destructive side, as the guard that keeps a metadata mismatch
    from deleting a real track.
    """
    links = links or {}
    apple_ids = {t["catalog_id"] for t in ap_tracks if t.get("catalog_id")}
    apple_keys = {track_key(t["name"], t["artist"]) for t in ap_tracks}

    expected_ids = set()
    sp_keys = set()
    to_add = []
    for track in sp_tracks:
        candidate_ids = {c["id"] for c in isrc_candidates.get(track["isrc"] or "", []) if c.get("id")}
        linked_id = links.get(track.get("id"))
        if linked_id:
            candidate_ids.add(linked_id)
        expected_ids |= candidate_ids
        keys = spotify_track_keys(track)
        sp_keys |= keys
        # Adds are suppressed only by exact matches -a fuzzy near-miss here
        # would silently keep a real track out forever. Worst case is a
        # visible duplicate, which the exact loose key already makes rare.
        if candidate_ids & apple_ids:
            continue
        if keys & apple_keys:
            continue
        to_add.append(track)
    to_add.sort(key=lambda t: t["added_at"])  # ISO-8601 Z strings sort lexicographically

    to_remove = []
    for track in ap_tracks:
        if track.get("catalog_id") and track["catalog_id"] in expected_ids:
            continue
        key = track_key(track["name"], track["artist"])
        if key in sp_keys or fuzzy_in(key, sp_keys, threshold):
            continue
        to_remove.append(track)
    return to_add, to_remove


def protect_removals(to_remove, not_found_tracks, threshold=0.8):
    """Split removals into (safe, held): an Apple track resembling a Spotify
    track that has NO Apple Music match must not be deleted - that would drop
    the song with no replacement. Deliberately loose threshold: wrongly holding
    a removal just leaves an extra track; wrongly deleting loses music."""
    nf_keys = set()
    for track in not_found_tracks:
        nf_keys |= spotify_track_keys(track)
    safe, held = [], []
    for track in to_remove:
        key = track_key(track["name"], track["artist"])
        if key in nf_keys or fuzzy_in(key, nf_keys, threshold):
            held.append(track)
        else:
            safe.append(track)
    return safe, held


# -- Mirror ---------------------------------------------------------------------
def load_cache(cache_file):
    try:
        with open(cache_file) as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        data = {}
    return {"isrc": data.get("isrc", {}), "search": data.get("search", {}), "dirty": False}


def save_cache(cache_file, cache):
    if not cache.pop("dirty", False):
        return
    with open(cache_file, "w") as f:
        json.dump({"isrc": cache["isrc"], "search": cache["search"]}, f, indent=1)


def mirror_pair(sp_tracks, headers, storefront, sp_playlist, ap_playlist, cache, songs, *, execute, max_removals, max_adds):
    """Mirror one pair. Returns True when the pass left the pair fully clean
    (everything applied, no guard tripped) — the signal that lets the next
    execute pass skip this pair while its Spotify snapshot is unchanged."""
    name = sp_playlist.get("name", "?")
    ap_tracks = apple_playlist_tracks(headers, ap_playlist["id"])
    log(f"'{name}': Spotify {len(sp_tracks)} tracks | Apple {len(ap_tracks)} tracks")

    song_cache.upsert_many(songs, "spotify", sp_tracks)
    song_cache.upsert_many(songs, "apple", ap_tracks)

    links = song_cache.get_links(songs, "apple", [t.get("id") for t in sp_tracks])
    apple_songs_by_isrc(headers, storefront, sorted({t["isrc"] for t in sp_tracks if t["isrc"]}), cache)
    to_add, to_remove = compute_diff(sp_tracks, ap_tracks, cache["isrc"], links)

    # Resolve additions to Apple catalog ids, oldest added_at first.
    present_or_pending = {t["catalog_id"] for t in ap_tracks if t.get("catalog_id")}
    additions, not_found = [], []
    new_links = {}
    for track in to_add:
        label = f"{track['name']} - {', '.join(track['artists'])}"
        catalog_id = links.get(track.get("id"))
        if not catalog_id:
            candidates = cache["isrc"].get(track["isrc"] or "", [])
            candidates = [c for c in candidates if c.get("id")]
            if candidates and track["duration_ms"] is not None:
                candidates.sort(key=lambda c: abs((c.get("duration_ms") or 0) - track["duration_ms"]))
            catalog_id = candidates[0]["id"] if candidates else None
        if not catalog_id:
            try:
                catalog_id = apple_search_song(
                    headers, storefront, track["name"], track["artists"], track["duration_ms"], cache
                )
            except AppleAuthError:
                raise
            except Exception as e:
                log(f"  !! search failed for {label}: {e!r}")
                catalog_id = None
        if not catalog_id:
            not_found.append(track)
            continue
        if track.get("id"):
            new_links[track["id"]] = catalog_id
        if catalog_id not in present_or_pending:
            additions.append((catalog_id, label))
            present_or_pending.add(catalog_id)
    song_cache.set_links(songs, "apple", new_links)

    guard_tripped = False
    # Cap adds per pass: giant backfills in one burst look robotic and risk
    # rate limiting; the loop finishes the rest on subsequent passes.
    if len(additions) > max_adds:
        log(f"  .. {len(additions)} additions capped at {max_adds} this pass (rest continue next pass).")
        additions = additions[:max_adds]
        guard_tripped = True

    # Removal safety rails.
    removals, held = protect_removals(to_remove, not_found)
    for track in held:
        log(f"  ~ held (Spotify twin has no Apple match): {track['name']} - {track['artist']}")
    if not sp_tracks and ap_tracks:
        log(f"  !! Spotify returned 0 tracks while Apple has {len(ap_tracks)} -skipping removals "
            "(empty the Apple playlist manually if this is intentional).")
        removals = []
        guard_tripped = True
    elif len(removals) > max_removals:
        log(f"  !! {len(removals)} removals exceed --max-removals={max_removals} -skipping removals this pass.")
        removals = []
        guard_tripped = True

    for catalog_id, label in additions:
        log(f"  + {label}" + ("" if execute else " (dry run)"))
    for track in removals:
        log(f"  - {track['name']} - {track['artist']}" + ("" if execute else " (dry run)"))
    for track in not_found:
        log(f"  x Not on Apple Music: {track['name']} - {', '.join(track['artists'])}")

    if execute:
        if additions:
            apple_add_tracks(headers, ap_playlist["id"], [cid for cid, _ in additions])
        for track in removals:
            apple_remove_track(headers, ap_playlist["id"], track["relationship_id"])

    log(
        f"  = {'applied' if execute else 'dry run'}: +{len(additions)} -{len(removals)}"
        + (f" | {len(not_found)} not found" if not_found else "")
        + (f" | {len(to_remove) - len(removals)} removals held back" if len(removals) != len(to_remove) else "")
    )
    return execute and not guard_tripped


def run_pass(opts):
    load_dotenv(override=True)  # pick up re-captured Apple tokens without a restart
    headers = apple_headers()
    sp = spotify_client()

    ap_by_name = {}
    for playlist in apple_library_playlists(headers):
        attrs = playlist.get("attributes", {})
        name = (attrs.get("name") or "").strip().casefold()
        if name and name not in ap_by_name:
            ap_by_name[name] = playlist
    sp_by_name = spotify_playlists_by_name(sp)

    wanted = {n.strip().casefold() for n in opts.playlists.split(",") if n.strip()} if opts.playlists else None
    selected = [sp_by_name[n] for n in sorted(sp_by_name) if wanted is None or n in wanted]
    if wanted:
        missing = wanted - {p["name"].strip().casefold() for p in selected}
        if missing:
            log(f"Not found on Spotify: {', '.join(sorted(missing))}")

    pairs = []
    for sp_playlist in selected:
        name = sp_playlist["name"].strip().casefold()
        ap_playlist = ap_by_name.get(name)
        if not ap_playlist:
            if opts.execute:
                ap_playlist = apple_create_playlist(headers, sp_playlist)
                log(f"'{sp_playlist['name']}': created Apple playlist (name + description copied)")
            else:
                log(f"'{sp_playlist['name']}': no Apple playlist - will create it on --execute")
                continue
        if ap_playlist.get("attributes", {}).get("canEdit") is False:
            log(f"Skipping '{sp_playlist['name']}': Apple playlist is not editable.")
            continue
        pairs.append((sp_playlist, ap_playlist))

    log(f"{'EXECUTE' if opts.execute else 'DRY RUN'}: {len(pairs)} playlist pair(s) to mirror")

    cache = load_cache(opts.cache_file)
    songs = song_cache.connect(opts.song_cache_file)
    sp_tracks_memo = {}
    sp_lock = threading.Lock()

    def get_sp_tracks(playlist_id):
        # The lock both guards the memo and serializes all spotipy calls -
        # the shared client is used from the Apple and YT threads.
        with sp_lock:
            if playlist_id not in sp_tracks_memo:
                sp_tracks_memo[playlist_id] = spotify_playlist_tracks(sp, playlist_id)
            return sp_tracks_memo[playlist_id]

    def apple_worker():
        for sp_playlist, ap_playlist in pairs:
            pair_key = sp_playlist["name"].strip().casefold()
            snapshot = sp_playlist.get("snapshot_id")
            if opts.execute and snapshot:
                state = song_cache.get_state(songs, pair_key, "apple")
                if state and state[0] == snapshot:
                    log(f"'{sp_playlist['name']}': unchanged since last clean sync - skipped")
                    continue
            try:
                clean = mirror_pair(
                    get_sp_tracks(sp_playlist["id"]), headers, opts.storefront,
                    sp_playlist, ap_playlist, cache, songs,
                    execute=opts.execute, max_removals=opts.max_removals, max_adds=opts.max_adds,
                )
                if clean and snapshot:
                    song_cache.set_state(songs, pair_key, "apple", snapshot, len(get_sp_tracks(sp_playlist["id"])))
            except AppleAuthError:
                raise
            except Exception as e:
                log(f"!! '{sp_playlist.get('name', '?')}' failed, continuing: {e!r}")

    def yt_worker():
        try:
            import ytmusic_mirror

            ytmusic_mirror.run(
                sp, selected, opts.song_cache_file,
                execute=opts.execute, max_removals=opts.max_removals, max_adds=opts.max_adds,
                get_sp_tracks=get_sp_tracks,
            )
        except Exception as e:
            log(f"!! YouTube Music mirror failed (Apple sync unaffected): {e!r}")

    # Apple and YT Music are separate hosts with separate rate limits, so the
    # two mirrors run concurrently; each stays sequential internally to keep
    # append order and to avoid robotic request bursts against one service.
    apple_errors = []

    def apple_worker_guarded():
        try:
            apple_worker()
        except BaseException as e:  # surface AppleAuthError after join
            apple_errors.append(e)

    try:
        apple_thread = threading.Thread(target=apple_worker_guarded, name="apple-mirror")
        yt_thread = threading.Thread(target=yt_worker, name="yt-mirror")
        apple_thread.start()
        yt_thread.start()
        apple_thread.join()
        yt_thread.join()
    finally:
        save_cache(opts.cache_file, cache)
        songs.close()
    if apple_errors:
        raise apple_errors[0]

    if opts.download_dir and opts.execute:
        try:
            import local_mirror

            local_mirror.run(sp, [sp_pl for sp_pl, _ in pairs], opts.download_dir)
        except Exception as e:
            log(f"!! Local download mirror failed (playlist sync unaffected): {e!r}")


def parse_args():
    parser = argparse.ArgumentParser(description="Mirror Spotify playlists to same-named Apple Music playlists.")
    parser.add_argument("--execute", action="store_true", help="Apply changes to Apple Music (default: dry run).")
    parser.add_argument("--loop", action="store_true", help="Run forever, sleeping --interval between passes.")
    parser.add_argument(
        "--interval", default=os.getenv("SYNC_INTERVAL", DEFAULT_INTERVAL),
        help=f"Loop sleep, e.g. 900, 15m, 1h (default: {DEFAULT_INTERVAL}).",
    )
    parser.add_argument(
        "--playlists", default=os.getenv("PLAYLISTS", ""),
        help="Comma-separated playlist names to sync (default: every same-named pair).",
    )
    parser.add_argument(
        "--max-removals", type=int, default=int(os.getenv("MAX_REMOVALS", DEFAULT_MAX_REMOVALS)),
        help=f"Per-playlist removal cap per pass; more than this skips removals (default: {DEFAULT_MAX_REMOVALS}).",
    )
    parser.add_argument(
        "--max-adds", type=int, default=int(os.getenv("MAX_ADDS", DEFAULT_MAX_ADDS)),
        help=f"Per-playlist additions cap per pass; the rest continue next pass (default: {DEFAULT_MAX_ADDS}).",
    )
    parser.add_argument(
        "--download-dir", default=os.getenv("DOWNLOAD_DIR", ""),
        help="Also mirror the paired playlists to local audio files under this folder (requires --execute).",
    )
    parser.add_argument(
        "--storefront", default=os.getenv("APPLE_STOREFRONT", DEFAULT_STOREFRONT),
        help=f"Apple catalog storefront (default: {DEFAULT_STOREFRONT}).",
    )
    parser.add_argument(
        "--cache-file", default=os.getenv("APPLE_CACHE_FILE", DEFAULT_CACHE_FILE),
        help=f"ISRC/search resolution cache (default: {DEFAULT_CACHE_FILE}).",
    )
    parser.add_argument(
        "--song-cache-file", default=os.getenv("SONG_CACHE_FILE", DEFAULT_SONG_CACHE_FILE),
        help=f"Ever-growing SQLite archive of all song metadata seen (default: {DEFAULT_SONG_CACHE_FILE}).",
    )
    args = parser.parse_args()
    args.interval_s = parse_interval(args.interval)
    if args.max_removals < 0:
        parser.error("--max-removals must be >= 0")
    if args.max_adds < 1:
        parser.error("--max-adds must be >= 1")
    return args


def main():
    opts = parse_args()
    while True:
        try:
            run_pass(opts)
        except AppleAuthError as e:
            log(f"!! {e}")
            if not opts.loop:
                sys.exit(2)
        except Exception as e:
            if not opts.loop:
                raise
            log(f"!! Pass failed: {e!r}")
        if not opts.loop:
            break
        log(f"Next pass in {opts.interval_s}s.")
        time.sleep(opts.interval_s)


if __name__ == "__main__":
    main()
