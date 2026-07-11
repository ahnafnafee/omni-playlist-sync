"""Offline self-check for the local download mirror: `uv run python test_downloads.py`."""

import os
import tempfile
import types
from datetime import datetime, timezone
from pathlib import Path

from spotify_mirror import downloads as lm


class FakeSp:
    def __init__(self, items):
        self._items = items

    def playlist_items(self, playlist_id, additional_types=("track",), limit=100):
        return {"items": self._items, "next": None}

    def next(self, page):
        raise AssertionError("no pagination expected")


def fake_item(name, artists, isrc, added_at, shape="track"):
    track = {"name": name, "type": "track", "is_local": False,
             "external_ids": {"isrc": isrc} if isrc else {},
             "artists": [{"name": a} for a in artists]}
    return {"added_at": added_at, shape: track}


def test_norm_and_sanitize():
    assert lm._norm(" The-Track  Name! ") == "the track name"
    assert not (set('<>:"/\\|?*') & set(lm.sanitize_folder('A/B: C*?')))
    assert lm.sanitize_folder("...") == "playlist" and lm.sanitize_folder(None) == "playlist"


def test_track_index_and_matcher():
    a, b = "2024-01-05T10:00:00Z", "2024-03-09T20:30:00Z"
    sp = FakeSp([
        fake_item("Song One", ["Alpha", "Beta"], "USUM71900001", a),
        fake_item("Song Two", ["Gamma"], None, b),
        {"added_at": None, "track": {"name": "skip"}},
        fake_item("Song Three", ["Delta"], None, "2024-05-01T00:00:00Z", shape="item"),  # current Web API shape
    ])
    by_isrc, by_key = lm.spotify_track_index(sp, "pl1")
    assert by_isrc["USUM71900001"] == datetime(2024, 1, 5, 10, 0, tzinfo=timezone.utc)
    assert "delta|song three" in by_key
    assert lm.match_added_at(["usum71900001 "], "?", [], by_isrc, by_key) == by_isrc["USUM71900001"]
    assert lm.match_added_at([], "Song One", ["Alpha, Beta"], by_isrc, by_key) == by_isrc["USUM71900001"]
    assert lm.match_added_at([], "nope", ["nobody"], by_isrc, by_key) is None


def test_stamp_mtimes():
    when = datetime(2023, 6, 1, 12, 0, tzinfo=timezone.utc)
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        (folder / "Artist").mkdir()
        (folder / "Artist" / "a.mp3").write_bytes(b"x")  # nested (Jellyfin layout)
        (folder / "b.mp3").write_bytes(b"x")
        (folder / "notes.txt").write_bytes(b"x")
        txt_mtime = (folder / "notes.txt").stat().st_mtime
        real = lm.file_added_at
        lm.file_added_at = lambda p, i, k: when if p.name == "a.mp3" else None
        try:
            stamped, unmatched = lm.stamp_mtimes(folder, {}, {})
        finally:
            lm.file_added_at = real
        assert (stamped, unmatched) == (1, 1)
        assert abs((folder / "Artist" / "a.mp3").stat().st_mtime - when.timestamp()) < 1
        assert (folder / "notes.txt").stat().st_mtime == txt_mtime  # non-audio untouched


def test_build_sync_cmd():
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        save, url = folder / ".sync.spotdl", "https://open.spotify.com/playlist/abc"
        cmd = lm.build_sync_cmd(folder, save, url)
        assert "sync" in cmd and url in cmd and "--save-file" in cmd
        assert cmd[cmd.index("--output") + 1] == "{album-artist}/{album}/{artists} - {title}.{output-ext}"
        assert cmd[cmd.index("--m3u") + 1] == f"{folder.name}.m3u8"
        assert cmd[cmd.index("--overwrite") + 1] == "skip"  # existing files skipped
        save.write_text("{}")
        os.environ["LOCAL_MIRROR_FORMAT"] = "flac"
        try:
            cmd = lm.build_sync_cmd(folder, save, url)
        finally:
            del os.environ["LOCAL_MIRROR_FORMAT"]
        assert str(save) in cmd and "--save-file" not in cmd and url not in cmd
        assert cmd[cmd.index("--format") + 1] == "flac"


def test_stream_parsing():
    lines = [
        "Processing query: abc\n",
        'Downloaded "Artist - Title": https://youtu.be/x\n',
        "Skipping Artist - Old (file already exists)\n",
        "LookupError: No results found for song: Weird Track\n",
        "\n",
    ]
    proc = types.SimpleNamespace(stdout=iter(lines), returncode=0, wait=lambda: None, kill=lambda: None)
    real = lm.subprocess.Popen
    lm.subprocess.Popen = lambda *a, **k: proc
    try:
        with tempfile.TemporaryDirectory() as tmp:
            downloaded, skipped, code = lm._stream_spotdl(["x"], Path(tmp), 5)
    finally:
        lm.subprocess.Popen = real
    assert (downloaded, skipped, code) == (1, 1, 0)


def test_save_cover():
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        real = lm.requests.get
        lm.requests.get = lambda *a, **k: types.SimpleNamespace(content=b"JPEGDATA", raise_for_status=lambda: None)
        try:
            lm.save_cover({"images": [{"url": "http://x/big.jpg"}]}, folder)
            first = (folder / "cover.jpg").read_bytes()
            lm.requests.get = lambda *a, **k: (_ for _ in ()).throw(AssertionError("should be cached"))
            lm.save_cover({"images": [{"url": "http://x/big.jpg"}]}, folder)  # unchanged URL -> no refetch
        finally:
            lm.requests.get = real
        assert first == b"JPEGDATA"
        assert (folder / "folder.jpg").read_bytes() == b"JPEGDATA"


def test_run_skips_without_spotdl():
    real = lm.importlib.util.find_spec
    lm.importlib.util.find_spec = lambda name: None
    try:
        lm.run(None, [{"id": "x", "name": "X"}], tempfile.mkdtemp())  # must not raise
    finally:
        lm.importlib.util.find_spec = real


def test_run_name_collision():
    calls, real = [], (lm.importlib.util.find_spec, lm.ffmpeg_available, lm._sync_one)
    lm.importlib.util.find_spec = lambda name: object()
    lm.ffmpeg_available = lambda: True
    lm._sync_one = lambda sp, pl, folder, t: calls.append(folder.name)
    try:
        with tempfile.TemporaryDirectory() as tmp:
            lm.run(None, [{"id": "id111111a", "name": "Mix"}, {"id": "id222222b", "name": "Mix"},
                          {"id": "id333333c", "name": "Chill"}], tmp)
    finally:
        lm.importlib.util.find_spec, lm.ffmpeg_available, lm._sync_one = real
    assert calls == ["Mix", "Mix [id222222]", "Chill"]


if __name__ == "__main__":
    for name in sorted(k for k in dict(globals()) if k.startswith("test_")):
        globals()[name]()
        print(f"ok {name}")
    print("all download checks passed")
