"""Mirror Spotify playlists to same-named YouTube Music playlists.

Same contract as the Apple mirror: Spotify is the source of truth, pairs are
discovered by case-insensitive name, missing tracks are appended one call at a
time ordered by added_at ascending (most recently added lands last), tracks
gone from Spotify are removed behind the same safety rails.

YouTube Music has no ISRC, so matching is title/artist keys with the shared
fuzzy scorer. Auth is a captured-browser-headers file (`uv run ytmusicapi
browser --file ytmusic_browser.json`) — same pattern as the Apple tokens.
"""

import os
import random
import time

import main
import song_cache
from main import fuzzy_in, log, polite_sleep, spotify_track_keys, track_key

DEFAULT_AUTH_FILE = "ytmusic_browser.json"
DEFAULT_CACHE_FILE = "ytmusic_resolve_cache.json"


def compute_diff_by_keys(sp_tracks, yt_tracks, links=None, threshold=main.FUZZY_THRESHOLD):
    """Pure key-based diff. links ({spotify_id: videoId} from previous matches)
    is the hard identifier — checked before keys on both sides. Same posture
    as the Apple diff: adds suppressed only by exact matches, the destructive
    side additionally protected by the fuzzy guard."""
    links = links or {}
    yt_ids = {t["videoId"] for t in yt_tracks if t.get("videoId")}
    yt_keys = set()
    for track in yt_tracks:
        yt_keys |= spotify_track_keys(track)

    linked_expected = set()
    sp_keys = set()
    to_add = []
    for track in sp_tracks:
        keys = spotify_track_keys(track)
        sp_keys |= keys
        linked_id = links.get(track.get("id"))
        if linked_id:
            linked_expected.add(linked_id)
            if linked_id in yt_ids:
                continue
        if keys & yt_keys:
            continue
        to_add.append(track)
    to_add.sort(key=lambda t: t["added_at"])

    to_remove = []
    for track in yt_tracks:
        if track.get("videoId") in linked_expected:
            continue
        key = track_key(track["name"], track["artist"])
        if key in sp_keys or fuzzy_in(key, sp_keys, threshold):
            continue
        to_remove.append(track)
    return to_add, to_remove


def parse_count(value):
    try:
        return int(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None


def with_backoff(fn, what):
    """Retry a YT call that hit rate limiting / bot detection (403/429) with
    escalating jittered waits; anything else raises immediately."""
    for attempt in range(4):
        try:
            return fn()
        except Exception as e:
            transient = any(code in str(e) for code in ("403", "429"))
            if not transient or attempt == 3:
                raise
            wait = 30 * (2 ** attempt) + random.uniform(0, 15)
            log(f"  yt rate-limited on {what}; backing off {int(wait)}s")
            time.sleep(wait)


def yt_playlist_tracks(yt, playlist_id):
    playlist = yt.get_playlist(playlist_id, limit=None)
    tracks = []
    for item in playlist.get("tracks") or []:
        if not item.get("videoId"):
            continue  # unavailable/removed video
        artists = [a.get("name", "") for a in item.get("artists") or [] if a.get("name")]
        duration_s = item.get("duration_seconds")
        tracks.append(
            {
                "id": item["videoId"],
                "videoId": item["videoId"],
                "setVideoId": item.get("setVideoId"),
                "name": item.get("title", ""),
                "artist": ", ".join(artists),
                "artists": artists or [""],
                "album": (item.get("album") or {}).get("name"),
                "duration_ms": duration_s * 1000 if duration_s else None,
            }
        )
    return playlist, tracks


def _score_yt_results(track, results, best):
    best_id, best_score = best
    for cand in results or []:
        vid = cand.get("videoId")
        if not vid:
            continue
        cand_artist = ", ".join(a.get("name", "") for a in cand.get("artists") or []) or cand.get("author") or ""
        duration_s = cand.get("duration_seconds")
        score, acceptable = main.score_candidate(
            track["name"], track["artists"], track["duration_ms"],
            cand.get("title", ""), cand_artist, duration_s * 1000 if duration_s else None,
        )
        if acceptable and score > best_score:
            best_id, best_score = vid, score
    return best_id, best_score


def resolve_video_id(yt, track, cache):
    """Spotify track -> YT videoId. Tries the 'songs' catalog first, then falls
    back to 'videos' (lots of Bangla / OST / instrumental tracks live on YT
    only as uploads, not catalog songs), then retries romanized for non-Latin
    titles. Stops at the first acceptable hit to keep the request count down.
    Misses are cached as None; delete the cache file to retry them."""
    primary = track["artists"][0] if track["artists"] else ""
    if not f"{track['name']} {primary}".strip():
        return None
    key = track_key(track["name"], " ".join(track["artists"]))
    if key in cache["search"]:
        return cache["search"][key]

    queries = [f"{track['name']} {primary}".strip()]
    rom = f"{main.romanized(track['name'])} {main.romanized(primary)}".strip()
    if rom and rom != main.normalize_text(queries[0]):
        queries.append(rom)

    best = (None, -1.0)
    for qi, query in enumerate(queries):
        for filt in ("songs", "videos"):
            try:
                results = with_backoff(lambda q=query, f=filt: yt.search(q, filter=f, limit=8), f"search {filt}")
            except Exception:
                if filt == "songs" and qi == 0:
                    raise  # a hard failure on the very first search is a real error
                results = []
            best = _score_yt_results(track, results, best)
            if best[0]:
                break  # acceptable match found; don't spend more searches
        if best[0]:
            break

    best_id = best[0]
    cache["search"][key] = best_id
    cache["dirty"] = True
    polite_sleep(0.6)
    return best_id


def mirror_pair(yt, sp_tracks, sp_playlist, yt_playlist_meta, cache, songs, *, execute, max_removals, max_adds):
    """Returns (clean, yt_count_after) — clean means everything applied with no
    guard tripped, so the pair can be snapshot-skipped next execute pass."""
    name = sp_playlist.get("name", "?")
    playlist, yt_tracks = yt_playlist_tracks(yt, yt_playlist_meta["playlistId"])
    log(f"yt '{name}': Spotify {len(sp_tracks)} tracks | YT Music {len(yt_tracks)} tracks")

    song_cache.upsert_many(songs, "spotify", sp_tracks)
    song_cache.upsert_many(songs, "ytmusic", yt_tracks)

    if playlist.get("owned") is False:
        log("  yt: playlist is not owned by this account - skipping (cannot edit).")
        return False, None

    links = song_cache.get_links(songs, "ytmusic", [t.get("id") for t in sp_tracks])
    to_add, to_remove = compute_diff_by_keys(sp_tracks, yt_tracks, links)

    additions, not_found = [], []
    new_links = {}
    pending_ids = {t["videoId"] for t in yt_tracks}
    for track in to_add:
        label = f"{track['name']} - {', '.join(track['artists'])}"
        video_id = links.get(track.get("id"))
        if not video_id:
            try:
                video_id = resolve_video_id(yt, track, cache)
            except Exception as e:
                log(f"  !! yt search failed for {label}: {e!r}")
                video_id = None
        if not video_id:
            not_found.append(track)
            continue
        if track.get("id"):
            new_links[track["id"]] = video_id
        if video_id not in pending_ids:
            additions.append((video_id, label))
            pending_ids.add(video_id)
    song_cache.set_links(songs, "ytmusic", new_links)

    guard_tripped = False
    if len(additions) > max_adds:
        log(f"  .. yt: {len(additions)} additions capped at {max_adds} this pass (rest continue next pass).")
        additions = additions[:max_adds]
        guard_tripped = True
    removals, held = main.protect_removals(to_remove, not_found)
    for track in held:
        log(f"  ~ held (Spotify twin has no YT match): {track['name']} - {track['artist']}")
    if not sp_tracks and yt_tracks:
        log(f"  !! Spotify returned 0 tracks while YT has {len(yt_tracks)} - skipping removals.")
        removals = []
        guard_tripped = True
    elif len(removals) > max_removals:
        log(f"  !! {len(removals)} removals exceed --max-removals={max_removals} - skipping removals this pass.")
        removals = []
        guard_tripped = True
    removals = [t for t in removals if t.get("setVideoId")]  # required for removal

    for _, label in additions:
        log(f"  yt + {label}" + ("" if execute else " (dry run)"))
    for track in removals:
        log(f"  yt - {track['name']} - {track['artist']}" + ("" if execute else " (dry run)"))
    for track in not_found:
        log(f"  x Not on YT Music: {track['name']} - {', '.join(track['artists'])}")

    if execute:
        # One item per call, in order - never batch (batching loses add order).
        playlist_id = yt_playlist_meta["playlistId"]
        for video_id, _ in additions:
            with_backoff(
                lambda v=video_id: yt.add_playlist_items(playlist_id, [v], duplicates=False), "add"
            )
            polite_sleep(1.2)
        for track in removals:
            with_backoff(
                lambda t=track: yt.remove_playlist_items(
                    playlist_id, [{"videoId": t["videoId"], "setVideoId": t["setVideoId"]}]
                ),
                "remove",
            )
            polite_sleep(1.2)

    log(
        f"  = yt {'applied' if execute else 'dry run'}: +{len(additions)} -{len(removals)}"
        + (f" | {len(not_found)} not found" if not_found else "")
        + (f" | {len(to_remove) - len(removals)} removals held back" if len(removals) != len(to_remove) else "")
    )
    return (execute and not guard_tripped), len(yt_tracks) + len(additions) - len(removals)


def run(sp, spotify_playlists, song_cache_file, *, execute, max_removals, max_adds, get_sp_tracks=None):
    """Never raises out; skips cleanly when auth or the library is not set up.
    Opens its own SQLite connection - this runs on its own thread."""
    if get_sp_tracks is None:
        get_sp_tracks = lambda playlist_id: main.spotify_playlist_tracks(sp, playlist_id)
    auth_file = os.getenv("YTMUSIC_AUTH_FILE", DEFAULT_AUTH_FILE)
    if not os.path.exists(auth_file):
        log(f"YT Music mirror skipped: no auth file '{auth_file}' "
            "(create with: uv run ytmusicapi browser --file ytmusic_browser.json)")
        return
    try:
        from ytmusicapi import YTMusic
    except ImportError:
        log("YT Music mirror skipped: ytmusicapi not installed (uv sync)")
        return

    try:
        yt = YTMusic(auth_file)
        yt_by_name = {}
        for playlist in yt.get_library_playlists(limit=None) or []:
            key = (playlist.get("title") or "").strip().casefold()
            if key and key not in yt_by_name:
                yt_by_name[key] = playlist
    except Exception as e:
        log(f"!! YT Music mirror unavailable (re-run ytmusicapi browser setup?): {e!r}")
        return

    existing = sum(1 for p in spotify_playlists if p["name"].strip().casefold() in yt_by_name)
    log(f"YT Music: {existing}/{len(spotify_playlists)} selected playlists exist "
        "(missing ones are created on --execute)")

    songs = song_cache.connect(song_cache_file)
    cache = main.load_cache(os.getenv("YTMUSIC_CACHE_FILE", DEFAULT_CACHE_FILE))
    try:
        for sp_playlist in spotify_playlists:
            pair_key = sp_playlist["name"].strip().casefold()
            yt_playlist_meta = yt_by_name.get(pair_key)
            if not yt_playlist_meta:
                if not execute:
                    log(f"yt '{sp_playlist['name']}': no YT Music playlist - will create it on --execute")
                    continue
                try:
                    playlist_id = with_backoff(
                        lambda: yt.create_playlist(
                            sp_playlist["name"], main.spotify_description(sp_playlist), privacy_status="PRIVATE"
                        ),
                        "create",
                    )
                except Exception as e:
                    log(f"!! yt '{sp_playlist['name']}': create failed: {e!r}")
                    continue
                # ytmusicapi returns the id as a str on the happy path, but can
                # hand back the raw API response dict - the id is inside it.
                if isinstance(playlist_id, dict):
                    playlist_id = playlist_id.get("playlistId") or playlist_id.get("id")
                if not isinstance(playlist_id, str) or not playlist_id:
                    log(f"!! yt '{sp_playlist['name']}': create failed: {playlist_id!r}")
                    continue
                yt_playlist_meta = {"playlistId": playlist_id, "title": sp_playlist["name"], "count": "0"}
                log(f"yt '{sp_playlist['name']}': created YT Music playlist (name + description copied, private)")
                polite_sleep(2.0)  # let the new playlist settle before writing to it
            snapshot = sp_playlist.get("snapshot_id")
            yt_count = parse_count(yt_playlist_meta.get("count"))
            if execute and snapshot:
                state = song_cache.get_state(songs, pair_key, "ytmusic")
                # Skip only when Spotify's snapshot AND YT's own count are both
                # unchanged - the count catches manual YT-side edits.
                if state and state[0] == snapshot and (
                    state[1] is None or yt_count is None or yt_count == state[1]
                ):
                    log(f"yt '{sp_playlist['name']}': unchanged since last clean sync - skipped")
                    continue
            try:
                clean, count_after = mirror_pair(
                    yt, get_sp_tracks(sp_playlist["id"]), sp_playlist, yt_playlist_meta, cache, songs,
                    execute=execute, max_removals=max_removals, max_adds=max_adds,
                )
                if clean and snapshot:
                    song_cache.set_state(songs, pair_key, "ytmusic", snapshot, count_after)
            except Exception as e:
                log(f"!! yt '{sp_playlist.get('name', '?')}' failed, continuing: {e!r}")
    finally:
        main.save_cache(os.getenv("YTMUSIC_CACHE_FILE", DEFAULT_CACHE_FILE), cache)
        songs.close()
