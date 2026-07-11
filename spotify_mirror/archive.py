"""Ever-growing local SQLite archive + resolution memory.

Three tables in one file:
- songs:      every track ever seen on any service (never deleted) — a durable
              metadata record with first/last-seen timestamps.
- links:      spotify_id -> target_id for every successful match, so later
              passes match by hard identifier instead of re-searching.
- sync_state: a playlist's Spotify snapshot_id after a clean pass, so an
              unchanged pair can be skipped wholesale.

SQLite over a pickle blob: incremental writes, crash-safe, and inspectable
(`sqlite3 song_cache.db "SELECT name, artist, last_seen FROM songs"`).
"""

import json
import sqlite3
from datetime import datetime, timezone

SCHEMAS = [
    """
CREATE TABLE IF NOT EXISTS songs (
    source      TEXT NOT NULL,
    id          TEXT NOT NULL,
    isrc        TEXT,
    name        TEXT,
    artist      TEXT,
    album       TEXT,
    duration_ms INTEGER,
    meta        TEXT,
    first_seen  TEXT NOT NULL,
    last_seen   TEXT NOT NULL,
    PRIMARY KEY (source, id)
)
""",
    """
CREATE TABLE IF NOT EXISTS links (
    spotify_id TEXT NOT NULL,
    target     TEXT NOT NULL,
    target_id  TEXT NOT NULL,
    updated    TEXT NOT NULL,
    PRIMARY KEY (spotify_id, target)
)
""",
    """
CREATE TABLE IF NOT EXISTS sync_state (
    pair         TEXT NOT NULL,
    target       TEXT NOT NULL,
    snapshot_id  TEXT,
    target_count INTEGER,
    updated      TEXT NOT NULL,
    PRIMARY KEY (pair, target)
)
""",
]

UPSERT = """
INSERT INTO songs (source, id, isrc, name, artist, album, duration_ms, meta, first_seen, last_seen)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(source, id) DO UPDATE SET
    isrc = excluded.isrc, name = excluded.name, artist = excluded.artist,
    album = excluded.album, duration_ms = excluded.duration_ms,
    meta = excluded.meta, last_seen = excluded.last_seen
"""


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect(path):
    # check_same_thread=False: the Apple and YT mirrors run on separate threads,
    # each with its own use of a connection; the timeout rides out any lock.
    conn = sqlite3.connect(path, timeout=30, check_same_thread=False)
    for schema in SCHEMAS:
        conn.execute(schema)
    conn.commit()
    return conn


def upsert_many(conn, source, tracks):
    """Archive the sync's own snapshot dicts (any service shape). first_seen is
    preserved on refresh; meta keeps the full snapshot as JSON."""
    now = _now()
    rows = []
    for track in tracks:
        song_id = track.get("id") or track.get("catalog_id") or track.get("relationship_id")
        if not song_id:
            continue
        artist = track.get("artist") or ", ".join(track.get("artists") or [])
        rows.append((
            source, song_id, track.get("isrc"), track.get("name"), artist,
            track.get("album"), track.get("duration_ms"),
            json.dumps(track, ensure_ascii=False), now, now,
        ))
    if rows:
        conn.executemany(UPSERT, rows)
        conn.commit()
    return len(rows)


def get_links(conn, target, spotify_ids):
    """{spotify_id: target_id} for previously matched tracks."""
    out = {}
    ids = [i for i in spotify_ids if i]
    for i in range(0, len(ids), 500):
        chunk = ids[i : i + 500]
        marks = ",".join("?" * len(chunk))
        rows = conn.execute(
            f"SELECT spotify_id, target_id FROM links WHERE target = ? AND spotify_id IN ({marks})",
            [target, *chunk],
        )
        out.update(dict(rows.fetchall()))
    return out


def set_links(conn, target, mapping):
    # ponytail: links are trusted forever; delete a row to force re-resolution
    # if a linked id ever goes stale (e.g. a regional catalog pull).
    rows = [(sid, target, tid, _now()) for sid, tid in mapping.items() if sid and tid]
    if rows:
        conn.executemany("INSERT OR REPLACE INTO links VALUES (?, ?, ?, ?)", rows)
        conn.commit()


def get_state(conn, pair, target):
    return conn.execute(
        "SELECT snapshot_id, target_count FROM sync_state WHERE pair = ? AND target = ?", (pair, target)
    ).fetchone()


def set_state(conn, pair, target, snapshot_id, target_count):
    conn.execute(
        "INSERT OR REPLACE INTO sync_state VALUES (?, ?, ?, ?, ?)",
        (pair, target, snapshot_id, target_count, _now()),
    )
    conn.commit()
