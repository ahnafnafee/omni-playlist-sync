"""Local audio mirror via spotDL, in a Jellyfin-ready layout.

One folder per playlist, `AlbumArtist/Album/Artists - Title.<ext>` inside, plus
a `<Playlist>.m3u8` Jellyfin imports as the playlist and the Spotify cover art
saved as `cover.jpg`/`folder.jpg`. spotDL's `sync` is incremental and
resumable: completed files are skipped, tracks removed from the playlist are
deleted, and an interrupted run just continues on the next pass (only the file
being downloaded when it stopped is re-fetched). Each pass restamps every
file's mtime to its Spotify added-at date so Date-Modified sort = date-added.
"""

import importlib.util
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

import requests

from . import spotify
from .logs import fmt_secs, log_download, log_miss, log_note, log_section, log_summary, log_warn
from .matching import normalize_text as _norm

AUDIO_EXTS = {".mp3", ".flac", ".ogg", ".opus", ".m4a", ".wav"}
DEFAULT_TIMEOUT_S = 3600  # ponytail: blunt per-playlist cap; a killed run resumes next pass


def sanitize_folder(name):
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name or "").strip().rstrip(" .")
    return cleaned or "playlist"


def ffmpeg_available():
    if shutil.which("ffmpeg"):
        return True
    return (Path.home() / ".spotdl" / ("ffmpeg.exe" if os.name == "nt" else "ffmpeg")).is_file()


def spotify_track_index(sp, playlist_id):
    """{ISRC: added_at} and {'artist|title': added_at} from the live playlist."""
    by_isrc, by_key = {}, {}
    page = sp.playlist_items(playlist_id, additional_types=("track",), limit=100)
    while page:
        for item in page.get("items", []):
            track = spotify.playlist_item_track(item)
            added = item.get("added_at")
            if not added or not track:
                continue
            try:
                when = datetime.fromisoformat(added.replace("Z", "+00:00"))
            except ValueError:
                continue
            isrc = (track.get("external_ids") or {}).get("isrc")
            if isrc:
                by_isrc[isrc.strip().upper()] = when
            title = _norm(track.get("name"))
            artists = [a.get("name", "") for a in track.get("artists", []) if a.get("name")]
            if title:
                for artist in {_norm(artists[0] if artists else ""), _norm(" ".join(artists))}:
                    if artist:
                        by_key[f"{artist}|{title}"] = when
        page = sp.next(page) if page.get("next") else None
    return by_isrc, by_key


def match_added_at(isrcs, title, raw_artists, by_isrc, by_key):
    for isrc in isrcs:
        when = by_isrc.get(str(isrc).strip().upper())
        if when:
            return when
    title = _norm(title)
    if not title:
        return None
    for raw in raw_artists:
        for artist in (_norm(raw), _norm(re.split(r"[,;/]", raw)[0])):
            when = by_key.get(f"{artist}|{title}")
            if when:
                return when
    return None


def file_added_at(path, by_isrc, by_key):
    """Match via embedded tags — beats re-deriving spotDL's sanitized filenames,
    which drift across spotDL versions."""
    import mutagen  # spotDL dependency

    audio = mutagen.File(path, easy=True)
    if not audio:
        return None
    return match_added_at(audio.get("isrc") or [], (audio.get("title") or [""])[0],
                          audio.get("artist") or [], by_isrc, by_key)


def stamp_mtimes(folder, by_isrc, by_key):
    stamped = unmatched = 0
    for path in sorted(folder.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in AUDIO_EXTS:
            continue
        try:
            when = file_added_at(path, by_isrc, by_key)
        except Exception:
            when = None
        if when:
            os.utime(path, (when.timestamp(), when.timestamp()))
            stamped += 1
        else:
            unmatched += 1
    return stamped, unmatched


def save_cover(playlist, folder):
    """Save the highest-resolution Spotify playlist cover as cover.jpg +
    folder.jpg (Jellyfin folder image). Re-downloads only when the URL changes."""
    images = playlist.get("images") or []
    url = images[0].get("url") if images else None  # Spotify lists largest first
    if not url:
        return
    marker = folder / ".cover_url"
    if (folder / "cover.jpg").exists() and marker.exists() and marker.read_text(encoding="utf-8").strip() == url:
        return
    try:
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        for fname in ("cover.jpg", "folder.jpg"):
            (folder / fname).write_bytes(r.content)
        marker.write_text(url, encoding="utf-8")
        log_download(f"cover art saved ({len(r.content) // 1024} KB)", tag="local")
    except Exception as e:
        log_warn(f"cover art failed: {e!r}", tag="local")


def build_sync_cmd(folder, save_file, playlist_url):
    cmd = [sys.executable, "-m", "spotdl", "sync"]
    cmd.append(str(save_file) if save_file.exists() else playlist_url)
    if not save_file.exists():
        cmd += ["--save-file", str(save_file)]
    # Same --output every run so sync's delete step recomputes old paths. Paths
    # are relative to the playlist folder (cwd), so the m3u stays valid wherever
    # the music root is mounted. Jellyfin names the playlist after the m3u file.
    cmd += [
        "--output", "{album-artist}/{album}/{artists} - {title}.{output-ext}",
        "--m3u", f"{folder.name}.m3u8",
        "--overwrite", "skip",  # never re-download a file that already exists (resume-friendly)
        "--simple-tui",
    ]
    client_id, client_secret = os.getenv("SPOTIFY_CLIENT_ID"), os.getenv("SPOTIFY_CLIENT_SECRET")
    if client_id and client_secret:
        cmd += ["--client-id", client_id, "--client-secret", client_secret]
    audio_format = os.getenv("LOCAL_MIRROR_FORMAT")
    if audio_format:
        cmd += ["--format", audio_format]
    return cmd


def _stream_spotdl(cmd, folder, timeout_s):
    """Run spotDL, streaming meaningful lines live. Returns (downloaded, skipped,
    return_code). A watchdog kills a hung run after timeout_s; because the read
    loop ends when the pipe closes, completed downloads are preserved and the
    next pass resumes."""
    verbose = os.getenv("LOCAL_MIRROR_VERBOSE") == "1"
    downloaded = skipped = 0
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, encoding="utf-8", errors="replace", bufsize=1, cwd=str(folder))
    killer = threading.Timer(timeout_s, proc.kill)
    killer.start()
    try:
        for raw in proc.stdout:
            line = raw.strip()
            if not line:
                continue
            if verbose:
                log_note(line, tag="local")
            if line.startswith("Downloaded"):
                downloaded += 1
                title = line.split('"')[1] if '"' in line else line[len("Downloaded"):].strip(' :')
                log_download(f"downloaded: {title}", tag="local")
            elif line.startswith("Skipping"):
                skipped += 1
            elif "No results found" in line:
                log_miss(f"no audio source: {line.split(':', 1)[-1].strip()}", tag="local")
            elif "rror" in line or "Exception" in line:  # Error / *Error
                log_warn(line[:200], tag="local")
        proc.wait()
    finally:
        killer.cancel()
    return downloaded, skipped, proc.returncode


def _sync_one(sp, playlist, folder, timeout_s):
    name = playlist.get("name") or playlist["id"]
    folder.mkdir(parents=True, exist_ok=True)
    save_cover(playlist, folder)

    save_file = folder / ".sync.spotdl"  # spotDL requires the .spotdl extension
    url = (playlist.get("external_urls") or {}).get("spotify") or f"https://open.spotify.com/playlist/{playlist['id']}"
    started = time.monotonic()
    downloaded, skipped, code = _stream_spotdl(build_sync_cmd(folder, save_file, url), folder, timeout_s)
    if code != 0:
        log_warn(f"'{name}': spotdl exited {code} (partial progress kept; resumes next pass)", tag="local")

    by_isrc, by_key = spotify_track_index(sp, playlist["id"])
    stamped, _ = stamp_mtimes(folder, by_isrc, by_key)
    log_summary(f"{name}: {downloaded} downloaded, {skipped} already had, {stamped} date-stamped"
                f"  (in {fmt_secs(time.monotonic() - started)})", tag="local")


def run(sp, spotify_playlists, download_dir):
    """Never raises out; logs one skip line if spotdl/ffmpeg aren't set up."""
    try:
        if importlib.util.find_spec("spotdl") is None:
            log_note("local mirror skipped: spotdl not installed (uv sync --extra download)", tag="local")
            return
        if not ffmpeg_available():
            log_note("local mirror skipped: ffmpeg not found (install it or run `spotdl --download-ffmpeg`)", tag="local")
            return

        base = Path(download_dir)
        base.mkdir(parents=True, exist_ok=True)
        timeout_s = int(os.getenv("LOCAL_MIRROR_TIMEOUT", DEFAULT_TIMEOUT_S))
        log_section("Local downloads", f"{len(spotify_playlists)} playlist(s) -> {download_dir}", tag="local")

        used = set()
        for playlist in spotify_playlists:
            name = playlist.get("name") or playlist.get("id", "playlist")
            folder_name = sanitize_folder(name)
            if folder_name.casefold() in used:  # same-named playlists must not share a sync file
                folder_name = f"{folder_name} [{str(playlist.get('id', ''))[:8]}]"
            used.add(folder_name.casefold())
            try:
                _sync_one(sp, playlist, base / folder_name, timeout_s)
            except Exception as e:
                log_warn(f"'{name}': {e!r}", tag="local")
    except Exception as e:
        log_warn(f"local mirror failed: {e!r}", tag="local")
