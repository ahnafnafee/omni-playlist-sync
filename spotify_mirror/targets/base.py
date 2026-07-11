"""The mirror target contract + the shared per-playlist mirror algorithm.

A new service (Tidal, Deezer, ...) is added by subclassing `MirrorTarget` and
implementing ~8 small methods; the reconciliation logic — diff, resolve,
ordering, safety rails, logging, stats — lives once here in `mirror_pair`.
"""

import time

from .. import archive
from ..logs import (
    fmt_counts, fmt_secs, log_add, log_hold, log_miss, log_note, log_remove,
    log_section, log_summary, log_warn, paint,
)
from ..matching import compute_diff, protect_removals


class TargetAuthError(RuntimeError):
    """Auth expired / rejected. Fatal for the pass — never a partial write."""


class MirrorTarget:
    """Interface a mirror destination implements. See apple.py / ytmusic.py."""

    name = "target"       # human label, e.g. "Apple Music"
    tag = "target"        # short log tag, e.g. "apple"
    source = "target"     # archive source key, e.g. "apple"
    cache_file = None     # this target's own resolution cache path (ids differ per service)

    def list_playlists(self):
        """{casefolded name: playlist} of editable-or-not library playlists."""
        raise NotImplementedError

    def is_editable(self, playlist):
        return True

    def create(self, sp_playlist):
        """Create a same-named playlist (name + description copied)."""
        raise NotImplementedError

    def playlist_tracks(self, playlist):
        """Existing tracks as dicts with name/artist/duration_ms + an id."""
        raise NotImplementedError

    def track_id(self, track):
        """Stable id of an existing target track (for diffing / linking)."""
        raise NotImplementedError

    def playlist_count(self, playlist):
        """Current track count from list metadata (no API call), or None. Used
        to catch target-side edits when deciding a snapshot skip."""
        return None

    def prefetch(self, sp_tracks, cache):
        """Optional batch work before resolving (Apple: bulk ISRC lookup)."""

    def expected_ids(self, sp_tracks, links, cache):
        """{spotify_id: set(target_ids)} the track is known to correspond to."""
        return {t.get("id"): {links[t["id"]]} for t in sp_tracks if links.get(t.get("id"))}

    def resolve(self, sp_track, cache):
        """(target_id, method) for an unlinked track, or (None, None)."""
        raise NotImplementedError

    def add(self, playlist, target_ids):
        """Append target_ids IN ORDER, one request per id (never batch)."""
        raise NotImplementedError

    def remove(self, playlist, track):
        """Remove one existing target track."""
        raise NotImplementedError


def mirror_pair(target, sp_tracks, sp_playlist, tgt_playlist, cache, songs, *, execute, max_removals, max_adds):
    """Reconcile one Spotify→target playlist pair. Returns a stats dict; `clean`
    is True when everything applied with no guard tripped."""
    tag, name = target.tag, sp_playlist.get("name", "?")
    started = time.monotonic()
    tgt_tracks = target.playlist_tracks(tgt_playlist)
    log_section(name, f"Spotify {len(sp_tracks)} tracks - {target.name} {len(tgt_tracks)} tracks", tag=tag)

    archive.upsert_many(songs, "spotify", sp_tracks)
    archive.upsert_many(songs, target.source, tgt_tracks)

    links = archive.get_links(songs, target.source, [t.get("id") for t in sp_tracks])
    target.prefetch(sp_tracks, cache)
    to_add, to_remove = compute_diff(
        sp_tracks, tgt_tracks, target.expected_ids(sp_tracks, links, cache), target.track_id
    )
    if to_add:
        log_note(f"resolving {len(to_add)} new track(s) on {target.name}...", tag=tag)

    # Resolve additions to target ids, preserving the oldest-first order.
    present = {target.track_id(t) for t in tgt_tracks if target.track_id(t)}
    additions, not_found, new_links, methods = [], [], {}, {}
    for i, track in enumerate(to_add, 1):
        label = f"{track['name']} - {', '.join(track['artists'])}"
        tid = links.get(track.get("id"))
        method = "link" if tid else None
        if not tid:
            try:
                tid, method = target.resolve(track, cache)
            except TargetAuthError:
                raise
            except Exception as e:
                log_warn(f"resolve failed: {label}: {e!r}", tag=tag)
                tid, method = None, None
        if len(to_add) > 25 and i % 25 == 0:
            log_note(f"  ...resolved {i}/{len(to_add)}", tag=tag)
        if not tid:
            not_found.append(track)
            continue
        if track.get("id"):
            new_links[track["id"]] = tid
        if tid not in present:
            method = method or "search"
            additions.append((tid, label, method))
            present.add(tid)
            methods[method] = methods.get(method, 0) + 1
    archive.set_links(songs, target.source, new_links)

    guard = False
    deferred = 0
    if len(additions) > max_adds:
        deferred = len(additions) - max_adds
        log_warn(f"{len(additions)} additions exceed --max-adds={max_adds}; deferring {deferred} to next pass", tag=tag)
        additions, guard = additions[:max_adds], True

    removals, held = protect_removals(to_remove, not_found)
    if not sp_tracks and tgt_tracks:
        log_warn(f"Spotify returned 0 tracks but {target.name} has {len(tgt_tracks)}; skipping all removals this pass", tag=tag)
        removals, guard = [], True
    elif len(removals) > max_removals:
        log_warn(f"{len(removals)} removals exceed --max-removals={max_removals}; skipping removals this pass", tag=tag)
        removals, guard = [], True

    for _, label, method in additions:
        log_add(f"{label}  {paint('(' + method + ')', 'grey')}", dry=not execute, tag=tag)
    for track in removals:
        log_remove(f"{track['name']} - {track['artist']}", dry=not execute, tag=tag)
    for track in held:
        log_hold(f"kept (no {target.name} match for its Spotify twin): {track['name']} - {track['artist']}", tag=tag)
    for track in not_found:
        log_miss(f"not on {target.name}: {track['name']} - {', '.join(track['artists'])}", tag=tag)

    if execute:
        if additions:
            target.add(tgt_playlist, [tid for tid, _, _ in additions])
        for track in removals:
            target.remove(tgt_playlist, track)

    via = ", ".join(f"{n} {m}" for m, n in sorted(methods.items(), key=lambda kv: -kv[1]))
    counts = fmt_counts(len(additions), len(removals), len(not_found), len(held), deferred)
    log_summary(
        f"{name}: {counts}  {paint('in ' + fmt_secs(time.monotonic() - started), 'grey')}"
        + (paint(f"  via {via}", "grey") if via else ""),
        tag=tag,
    )
    return {
        "clean": execute and not guard, "added": len(additions), "removed": len(removals),
        "missing": len(not_found), "held": len(held), "deferred": deferred,
        "target_count": len(tgt_tracks) + len(additions) - len(removals),
    }
