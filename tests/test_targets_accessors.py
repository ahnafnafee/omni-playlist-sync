"""Provider playlist accessors (name/id) resolve each service's dict shape."""

from omni_sync.engine.targets.apple import AppleMusicTarget
from omni_sync.engine.targets.base import MirrorTarget
from omni_sync.engine.targets.ytmusic import YTMusicTarget


def test_playlist_name_per_provider_shape():
    # accessors don't use self, so call unbound with a shaped dict
    assert MirrorTarget.playlist_name(None, {"name": "Spot"}) == "Spot"
    assert AppleMusicTarget.playlist_name(None, {"attributes": {"name": "Appl"}}) == "Appl"
    assert YTMusicTarget.playlist_name(None, {"title": "Yt"}) == "Yt"


def test_playlist_id_per_provider_shape():
    assert MirrorTarget.playlist_id(None, {"id": "s1"}) == "s1"          # spotify/apple
    assert YTMusicTarget.playlist_id(None, {"playlistId": "y1"}) == "y1"  # youtube


def test_apple_description_handles_missing():
    assert AppleMusicTarget.playlist_description(None, {"attributes": {}}) == ""
    assert AppleMusicTarget.playlist_description(
        None, {"attributes": {"description": {"standard": "hi"}}}
    ) == "hi"


def test_ytmusic_browser_backend_maps_shapes_and_is_selected(monkeypatch, tmp_path):
    # The opted-in no-quota browser backend is selected by build(), and maps
    # ytmusicapi's youtubei shapes to the engine's dicts (setVideoId for removal,
    # artists joined, duration in ms; id-less rows dropped).
    import omni_sync.engine.targets.ytmusic as yt

    class FakeYTM:
        def __init__(self, *a, **k):
            pass

        def get_playlist(self, pid, limit=None):
            return {"tracks": [
                {"videoId": "v1", "setVideoId": "s1", "title": "Song",
                 "artists": [{"name": "A"}, {"name": "B"}], "album": {"name": "Alb"},
                 "duration_seconds": 200},
                {"videoId": None},
            ]}

        def get_library_playlists(self, limit=None):
            return [{"playlistId": "p1", "title": "Mix", "count": "12 songs"}]

    monkeypatch.setattr("ytmusicapi.YTMusic", FakeYTM)
    auth = tmp_path / "browser.json"
    auth.write_text("{}")
    monkeypatch.setenv("YTMUSIC_BROWSER_AUTH", str(auth))
    monkeypatch.setenv("YTMUSIC_PREFER_BROWSER", "1")

    target = yt.build()
    assert isinstance(target, yt.YTMusicBrowserTarget)

    tracks = target.playlist_tracks({"playlistId": "p1"})
    assert len(tracks) == 1
    t = tracks[0]
    assert (t["videoId"], t["setVideoId"], t["artist"], t["duration_ms"]) == ("v1", "s1", "A, B", 200000)
    assert target.list_playlists() == {"mix": {"playlistId": "p1", "title": "Mix", "count": "12 songs"}}
