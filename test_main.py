"""Offline self-check for the diff logic: `uv run test_main.py`."""

import os
import tempfile

import song_cache
from main import compute_diff, parse_interval, playlist_item_track, protect_removals


def sp_track(name, artist, isrc, added_at, duration=200_000):
    return {"id": name, "isrc": isrc, "name": name, "artists": [artist], "duration_ms": duration, "added_at": added_at}


def ap_track(name, artist, catalog_id, rel="i.rel"):
    return {"relationship_id": rel, "catalog_id": catalog_id, "name": name, "artist": artist, "duration_ms": 200_000}


def run():
    assert parse_interval("900") == 900
    assert parse_interval("15m") == 900
    assert parse_interval("1h") == 3600

    candidates = {"ISRC1": [{"id": "cat1"}], "ISRC2": [{"id": "cat2"}], "ISRC3": [{"id": "cat3"}]}

    # ISRC candidate present on Apple -> no add; Apple track matched -> no remove.
    to_add, to_remove = compute_diff(
        [sp_track("Song A", "Artist", "ISRC1", "2024-01-01T00:00:00Z")],
        [ap_track("Song A (Remaster)", "Artist", "cat1")],
        candidates,
    )
    assert to_add == [] and to_remove == []

    # Missing tracks are added oldest-first, so the newest addition lands last.
    to_add, _ = compute_diff(
        [
            sp_track("New Song", "Artist", "ISRC2", "2026-07-01T00:00:00Z"),
            sp_track("Old Song", "Artist", "ISRC3", "2023-01-01T00:00:00Z"),
        ],
        [],
        candidates,
    )
    assert [t["name"] for t in to_add] == ["Old Song", "New Song"]

    # Apple-only track with no Spotify match is removed; a feat-clause title
    # variant maps to the same loose key, so it is protected AND not re-added.
    to_add, to_remove = compute_diff(
        [sp_track("Kept Song", "Same Artist", None, "2024-01-01T00:00:00Z")],
        [
            ap_track("Kept Song (feat. Same Artist)", "Same Artist", "catX", rel="i.keep"),
            ap_track("Totally Different", "Other Artist", "catY", rel="i.gone"),
        ],
        {},
    )
    assert [t["relationship_id"] for t in to_remove] == ["i.gone"]
    assert to_add == []

    # Version qualifiers are NOT conflated: Apple's live cut is a different
    # track, so it is removed and the studio version is added.
    to_add, to_remove = compute_diff(
        [sp_track("Some Song", "Artist", None, "2024-01-01T00:00:00Z")],
        [ap_track("Some Song (Live)", "Artist", "catL", rel="i.live")],
        {},
    )
    assert [t["name"] for t in to_add] == ["Some Song"]
    assert [t["relationship_id"] for t in to_remove] == ["i.live"]

    # No-ISRC Spotify track with an exact key match on Apple -> not re-added.
    to_add, to_remove = compute_diff(
        [sp_track("Plain Song", "Artist", None, "2024-01-01T00:00:00Z")],
        [ap_track("Plain Song", "Artist", None)],
        {},
    )
    assert to_add == [] and to_remove == []

    # YT Music key-based diff mirrors the same posture without identifiers.
    import ytmusic_mirror

    def yt_track(name, artist, video_id, set_id="s1"):
        return {
            "id": video_id, "videoId": video_id, "setVideoId": set_id,
            "name": name, "artist": artist, "artists": [artist], "duration_ms": 200_000,
        }

    to_add, to_remove = ytmusic_mirror.compute_diff_by_keys(
        [
            sp_track("New Song", "Artist", None, "2026-07-01T00:00:00Z"),
            sp_track("Old Song", "Artist", None, "2023-01-01T00:00:00Z"),
            sp_track("Kept Song", "Artist", None, "2024-01-01T00:00:00Z"),
        ],
        [
            yt_track("Kept Song (feat. Artist)", "Artist", "v.keep"),
            yt_track("Gone Song", "Other", "v.gone"),
        ],
    )
    assert [t["name"] for t in to_add] == ["Old Song", "New Song"]  # oldest first
    assert [t["videoId"] for t in to_remove] == ["v.gone"]

    # Net-loss guard: an Apple removal resembling an unresolvable Spotify
    # track is held; unrelated removals still go through.
    safe, held = protect_removals(
        [
            ap_track("Enemy (From Arcane)", "Imagine Dragons & Arcane", "catE", rel="i.held"),
            ap_track("Actually Gone", "Someone Else", "catG", rel="i.safe"),
        ],
        [sp_track("Enemy (with JID) - from Arcane", "Imagine Dragons", None, "2024-01-01T00:00:00Z")],
    )
    assert [t["relationship_id"] for t in held] == ["i.held"]
    assert [t["relationship_id"] for t in safe] == ["i.safe"]

    from main import score_candidate

    def accepts(*a):
        return score_candidate(*a)[1]

    # Suffix/decoration drift matches when the duration agrees...
    assert accepts("Elegia - 2015 Remaster", "New Order", 293_000, "Elegia", "New Order", 293_500)
    # ...but a different version whose duration disagrees is rejected.
    assert not accepts("Runaway - Piano Version", "AURORA", 243_000, "Runaway", "AURORA", 309_000)

    # Multi-artist: Spotify lists every credit, the service lists the primary.
    assert accepts(
        "Jeena Sikha De", ["Arijit Singh", "Ved Sharma", "Kunaal Vermaa"], 271_000,
        "Jeena Sikha De", "Arijit Singh", 271_000,
    )
    # Video-only track: decorated title + duration corroboration.
    assert accepts(
        "Tri", ["Popeye Bangladesh"], 241_000,
        "Popeye (Bangladesh) - Tri (ত্রি) Official Music Video", "Popeye Bangladesh", 241_000,
    )
    # Transliteration: Bengali <-> romanized, Cyrillic <-> romanized.
    assert accepts("Neshar Bojha", ["Syed Hassan Samin"], 300_000, "নেশার বোঝা", "Syed Hassan Samin", 300_000)
    assert accepts("Kamin", ["EMIN"], 200_000, "Камин", "EMIN", 201_000)
    # A cover by a different artist with a wrong duration is NOT accepted.
    assert not accepts("Oniket Prantor", ["Artcell"], 341_000, "Oniket Prantor", "Mehedi H Joy", 134_000)

    # Non-Latin scripts survive normalization; feat-credit drift still folds.
    from main import loose_name, track_key

    assert loose_name("Камин") == "камин"
    assert track_key("Камин (feat. JONY)", "EMIN JONY") == track_key("Камин", "EMIN & JONY".replace("&", ""))
    assert track_key("Камин (feat. JONY)", "EMIN & JONY") == track_key("Камин", "EMIN, JONY")
    assert loose_name("嘘") == "嘘"
    assert loose_name("炎") != loose_name("嘘")  # distinct CJK titles stay distinct
    to_add, to_remove = compute_diff(
        [sp_track("Камин (feat. JONY)", "EMIN & JONY", None, "2024-01-01T00:00:00Z")],
        [ap_track("Камин", "EMIN & JONY", None, rel="i.kamin")],
        {},
    )
    assert to_add == [] and to_remove == []

    # Playlist item shapes: legacy {"track": {...}}, current {"item": {...}},
    # episodes/locals/ghosts rejected.
    legacy = {"track": {"type": "track", "name": "L"}}
    current = {"item": {"type": "track", "name": "C"}}
    assert playlist_item_track(legacy)["name"] == "L"
    assert playlist_item_track(current)["name"] == "C"
    assert playlist_item_track({"item": {"type": "episode", "name": "Pod"}}) is None
    assert playlist_item_track({"is_local": True, "item": {"type": "track", "name": "X"}}) is None
    assert playlist_item_track({"track": None}) is None
    assert playlist_item_track({}) is None

    # Song archive: both snapshot shapes upsert; refresh keeps first_seen and
    # never deletes.
    db_path = os.path.join(tempfile.mkdtemp(), "songs.db")
    conn = song_cache.connect(db_path)
    assert song_cache.upsert_many(conn, "spotify", [sp_track("Song A", "Artist", "ISRC1", "2024-01-01T00:00:00Z")]) == 1
    assert song_cache.upsert_many(conn, "apple", [ap_track("Song A", "Artist", "cat1")]) == 1
    row = conn.execute("SELECT first_seen FROM songs WHERE source='spotify'").fetchone()
    conn.execute("UPDATE songs SET first_seen='2000-01-01T00:00:00+00:00', last_seen='2000-01-01T00:00:00+00:00'")
    conn.commit()
    renamed = sp_track("Song A", "Artist", "ISRC1", "2024-01-01T00:00:00Z")
    renamed["name"] = "Song A (Renamed)"  # same id -> refresh, not a new row
    song_cache.upsert_many(conn, "spotify", [renamed])
    first, last, name = conn.execute(
        "SELECT first_seen, last_seen, name FROM songs WHERE source='spotify'"
    ).fetchone()
    assert first == "2000-01-01T00:00:00+00:00"  # preserved
    assert last != "2000-01-01T00:00:00+00:00"  # refreshed
    assert name == "Song A (Renamed)"
    assert conn.execute("SELECT COUNT(*) FROM songs").fetchone()[0] == 2
    # Track with no usable id is skipped, not crashed on.
    assert song_cache.upsert_many(conn, "apple", [{"name": "No Id"}]) == 0

    # Identifier links: roundtrip + only requested/known ids returned.
    song_cache.set_links(conn, "apple", {"sp1": "cat1", "sp2": "cat2"})
    song_cache.set_links(conn, "ytmusic", {"sp1": "vid1"})
    assert song_cache.get_links(conn, "apple", ["sp1", "sp2", "sp3"]) == {"sp1": "cat1", "sp2": "cat2"}
    assert song_cache.get_links(conn, "ytmusic", ["sp1"]) == {"sp1": "vid1"}

    # Sync state roundtrip.
    assert song_cache.get_state(conn, "aurora", "apple") is None
    song_cache.set_state(conn, "aurora", "apple", "snapA", 100)
    assert song_cache.get_state(conn, "aurora", "apple") == ("snapA", 100)
    song_cache.set_state(conn, "aurora", "apple", "snapB", 101)
    assert song_cache.get_state(conn, "aurora", "apple") == ("snapB", 101)
    conn.close()

    # A link is a hard identifier: it suppresses the add and protects the
    # Apple/YT track from removal even when names disagree completely.
    linked_sp = sp_track("Renamed Completely", "Artist", None, "2024-01-01T00:00:00Z")
    linked_sp["id"] = "spL"
    to_add, to_remove = compute_diff(
        [linked_sp],
        [ap_track("Original Title", "Someone", "catL", rel="i.linked")],
        {},
        links={"spL": "catL"},
    )
    assert to_add == [] and to_remove == []

    import ytmusic_mirror as ym

    yt_linked = {
        "id": "vidL", "videoId": "vidL", "setVideoId": "s1",
        "name": "Original Title", "artist": "Someone", "artists": ["Someone"], "duration_ms": 1,
    }
    to_add, to_remove = ym.compute_diff_by_keys([linked_sp], [yt_linked], links={"spL": "vidL"})
    assert to_add == [] and to_remove == []
    assert ym.parse_count("1,065") == 1065 and ym.parse_count(None) is None

    print("OK: all checks passed")


if __name__ == "__main__":
    run()
