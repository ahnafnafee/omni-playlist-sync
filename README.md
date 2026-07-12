# 🎵 Spotify Playlist Mirror

[![CI](https://github.com/ahnafnafee/spotify-playlist-mirror-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/ahnafnafee/spotify-playlist-mirror-sync/actions/workflows/ci.yml)
![Python 3.13+](https://img.shields.io/badge/python-3.13%2B-blue)
![License: MIT](https://img.shields.io/badge/license-MIT-green)
![Docker ready](https://img.shields.io/badge/docker-ready-2496ED)

**Always-on, one-way playlist sync: Spotify → Apple Music, YouTube Music, and
local audio files (Jellyfin-ready).** Set it up once, and every playlist you
curate on Spotify stays mirrored everywhere — tracks added on Spotify appear
on the other services in date-added order, tracks you remove disappear, and an
optional download mirror keeps offline copies organized for your media server.

## Features

- 🔁 **True mirroring** — adds *and* removals, not append-only. Spotify is the
  source of truth; Apple Music and YouTube Music follow.
- 🎯 **ISRC-first matching** — exact recording identity where available, with
  Unicode-aware fuzzy title/artist/duration fallbacks (feat-credit drift,
  "- 2015 Remaster" suffixes, non-Latin scripts all handled).
- 🗂 **Same-name pairing + auto-create** — playlists link by name; missing ones
  are created with the Spotify name and description copied.
- 📥 **Local download mirror** ([spotDL](https://github.com/spotDL/spotify-downloader))
  — one folder per playlist in Jellyfin's `AlbumArtist/Album` layout, tagged
  with cover art, plus an auto-updated `.m3u8` per playlist.
- 🕒 **Date-added ordering** — tracks are appended one by one, oldest first, so
  every mirrored playlist stays sorted by date added (newest last).
- 🛡 **Safety rails** — dry-run by default, per-pass add/removal caps,
  net-loss protection, empty-snapshot guard, fail-closed on expired tokens.
- ⚡ **Fast re-runs** — Spotify `snapshot_id` skip, hard identifier links, and
  resolution caches make steady-state passes near-instant; Apple and YT Music
  mirrors run in parallel.
- 🚦 **Rate-limit friendly** — jittered pacing, exponential backoff on
  403/429, sequential per-service writes.
- 🗃 **Ever-growing song archive** — every track ever seen is recorded in a
  local SQLite database (name, artist, album, ISRC, raw metadata, first/last
  seen).
- 🐳 **Runs anywhere** — Docker Compose loop, Windows Task Scheduler, or plain
  CLI.

## How it works

Every pass, for each selected playlist name that exists on Spotify:

1. Snapshot the Spotify playlist (tracks, ISRCs, added-at dates).
2. Reconcile the same-named Apple Music playlist (via the web player's
   amp-api) and YouTube Music playlist (via
   [ytmusicapi](https://github.com/sigma67/ytmusicapi)) — concurrently.
3. Missing tracks are resolved (cached links → ISRC → scored search) and
   appended oldest-first; tracks gone from Spotify are removed behind guards.
4. Optionally, spotDL syncs a local audio folder per playlist.

> This project previously synced the other direction (Apple → Spotify). That
> mode is gone; the old `synced_isrcs.json` / `apple_spotify_uri_cache.json`
> files are obsolete and can be deleted.

### Matching

Same hierarchy the cross-service tools use
([TuneLink](https://tommcfarlin.com/case-study-tunelink-matching-music-ai/),
MusicBrainz): **hard identifier → search → fuzzy score**.

1. **Cached link** — once a Spotify track is matched to an Apple catalog id /
   YT videoId, that link is stored and reused (immune to title drift).
2. **ISRC** — exact recording identity where the service exposes it (Apple).
3. **Scored search** — [RapidFuzz](https://rapidfuzz.com/) `token_set_ratio`
   (order-, subset- and decoration-tolerant) + Jaro-Winkler, over both the raw
   and **romanized** ([anyascii](https://github.com/anyascii/anyascii)) title
   and artist, anchored by duration. This handles, without hardcoding:
   - **Multi-artist credits** — Spotify lists every feature, services list the
     primary (`Arijit Singh, Ved Sharma, …` ↔ `Arijit Singh`).
   - **Title decoration** — `Tri` ↔ `Popeye (Bangladesh) - Tri (ত্রি) Official
     Music Video`; `(feat. …)`, `- 2015 Remaster`, `(From "…")`.
   - **Transliteration** — Cyrillic/Bengali/Greek/Arabic (`Камин` ↔ `Kamin`,
     `নেশার বোঝা` ↔ `Neshar Bojha`).
   - **Video-only tracks** — YT search falls back to the `videos` filter, since
     many Bangla/indie/OST tracks live on YT only as uploads, not catalog songs.

   The **duration anchor** unlocks the looser (decoration/subset) title match,
   so a different version (`Runaway - Piano Version`) or a wrong-artist cover
   isn't accepted when its length disagrees.

   **Known limit:** CJK (Japanese/Chinese) romanizes to a *Chinese* reading, so
   kanji/kana titles that a service stores only in native script may still miss.
   Tracks with no confident match are reported (`x Not on …`) and skipped.

## Requirements

- Python 3.13+ and [`uv`](https://docs.astral.sh/uv/)
- Active Apple Music subscription (for the Apple mirror)
- Spotify account (free is fine — the Spotify side is read-only)
- YouTube Music account (optional, for the YT mirror)
- Docker (only for the always-running container option)

## Install

```bash
uv sync
```

## Environment variables

Copy `.env.example` to `.env` and fill it in.

Required:

- `APPLE_BEARER_TOKEN`
- `APPLE_USER_TOKEN`
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`

Optional (defaults in `.env.example`):

- `SPOTIFY_REDIRECT_URI` — must match your Spotify app setting
- `PLAYLISTS` — comma-separated names to sync; empty = every same-named pair
- `SYNC_INTERVAL` — loop sleep (`900`, `15m`, `1h`)
- `MAX_REMOVALS` / `MAX_ADDS` — per-playlist per-pass caps (safety rails)
- `DOWNLOAD_DIR` — enable the local download mirror
- `APPLE_STOREFRONT` — Apple catalog storefront (default `us`)

## Spotify setup

1. Go to <https://developer.spotify.com/dashboard>
2. Create an app
3. Copy `Client ID` and `Client Secret`
4. Add redirect URI: `http://127.0.0.1:8888/callback`

The script only requests the `playlist-read-private` scope — it never modifies
anything on Spotify. (Collaborative playlists aren't visible under this scope;
add `playlist-read-collaborative` in `spotify_client()` if you need them.)

## Apple token retrieval

The two headers from `music.apple.com` are enough — no Apple Developer
account needed.

1. Open <https://music.apple.com> and sign in
2. Open DevTools → **Network** tab
3. Play any song
4. Filter for requests to `amp-api.music.apple.com`
5. Open any `GET` request and copy from **Request Headers**:
   - `authorization: Bearer eyJ...` → `APPLE_BEARER_TOKEN` (the `eyJ...` part,
     without the `Bearer ` prefix)
   - `media-user-token: ...` → `APPLE_USER_TOKEN` (full value)

If either token expires (the bearer lasts months), the sync logs an auth error
telling you to repeat these steps. Update `.env` — a running loop picks up the
new values on its next pass (Docker needs a `docker compose restart`).

## Run

Default is a **dry run** — it prints every add/remove it *would* do and writes
nothing:

```bash
uv run main.py
```

Apply for real:

```bash
uv run main.py --execute
```

Useful flags:

```bash
uv run main.py --execute --playlists "Aurora,Chill"   # only these pairs
uv run main.py --execute --loop --interval 15m        # run forever
uv run main.py --execute --max-removals 100           # one-off larger cleanup
uv run main.py --execute --max-adds 500               # one-off larger backfill
```

First run opens a browser once for Spotify OAuth; the token is cached (default
`.cache`) and auto-refreshes afterwards.

## Always running: Docker

The container runs as **`spotify-mirror`** in the compose group
**`spotify-playlist-mirror-sync`**, loops `--execute` every `SYNC_INTERVAL`,
and persists auth + caches in `./data`.

**Seed the Spotify token first** — the container can't open a browser, so it
needs a cached token at `data/spotify_token_cache`. Either copy the one a
direct `uv run main.py` already created:

```bash
cp .cache data/spotify_token_cache          # PowerShell: copy .cache data\spotify_token_cache
```

…or generate it fresh:

```bash
SPOTIFY_TOKEN_CACHE=data/spotify_token_cache uv run main.py
```

For the YouTube Music mirror, also put its auth at `data/ytmusic_browser.json`.

**Downloads**: set `DOWNLOAD_DIR` in `.env` to your host music dir (e.g.
`F:\Torrent\Music`) — compose bind-mounts it to `/music` in the container
automatically (the Windows path in `.env` is overridden to `/music` inside).
From Docker, `JELLYFIN_URL` should be `http://host.docker.internal:8096`.

```bash
docker compose up -d --build
docker compose logs -f
```

## Always running: Windows Task Scheduler

Alternative to Docker — one-shot pass every 15 minutes, survives reboots:

```powershell
schtasks /Create /TN "SpotifyPlaylistMirror" /SC MINUTE /MO 15 `
  /TR "cmd /c cd /d D:\GitHub\apple-music-to-spotify-sync && uv run main.py --execute >> sync.log 2>&1"
```

Remove with `schtasks /Delete /TN "SpotifyPlaylistMirror" /F`.

Don't run the Docker container and the scheduled task at the same time — two
mirrors racing each other can briefly duplicate adds.

## YouTube Music mirror (optional)

The same mirroring (same-name pairs, adds oldest-first so newest lands last,
guarded removals, auto-create) also runs against YouTube Music whenever an
auth file is present — no auth file, and the step just logs a skip line.

One-time setup:

```bash
uv run ytmusicapi browser --file ytmusic_browser.json
```

Follow its prompt: open <https://music.youtube.com> logged in, DevTools →
Network, click a `/browse` POST request, copy the **request headers** and paste
them (finish with Ctrl-Z + Enter on Windows). Same idea as the Apple tokens.

Notes:

- YouTube Music has no ISRC, so matching is title/artist/duration based —
  slightly fuzzier than the Apple side, same safety rails.
- Only playlists owned by your YT account are edited; others are skipped.
- For Docker, put the auth file at `data/ytmusic_browser.json`.

## Local download mirror (optional)

Keeps an offline audio copy of each synced Spotify playlist, one folder per
playlist, via [spotDL](https://github.com/spotDL/spotify-downloader) (audio is
matched from YouTube Music). Sync is true mirroring: new tracks are downloaded,
tracks removed from the playlist are deleted locally. After each pass every
file's *Date Modified* is set to the track's Spotify added-at date — sort the
folder by Date Modified to get date-added order (newest last).

Enable:

```bash
uv sync --extra download
# ffmpeg required: winget install ffmpeg   (or: uv run spotdl --download-ffmpeg)
```

Set `DOWNLOAD_DIR` in `.env` (e.g. `F:\Torrent\Music`) — runs as part of each
`--execute` pass. In Docker it works out of the box: that host dir is
bind-mounted to `/music` and used automatically (the image already includes
spotdl and ffmpeg).

The layout is Jellyfin-ready — point a Jellyfin music library at the download
dir and both the tracks and the playlists appear, staying updated every pass:

```text
<DOWNLOAD_DIR>\
  <Playlist>\
    <Playlist>.m3u8          # auto-(re)generated; Jellyfin imports it as a
    cover.jpg / folder.jpg   # the Spotify playlist cover, highest resolution
    <AlbumArtist>\           # playlist named after the file, in Spotify order
      <Album>\
        Artists - Title.mp3  # tagged + cover art embedded
```

**Newest-first ordering.** The `.m3u8` is written by this tool (not spotDL) in
Spotify **date-added order, newest at the top** — so Jellyfin shows your latest
additions first, like Spotify. Set `LOCAL_MIRROR_ORDER=oldest` to flip it. Each
file's mtime is also stamped to its added-at date (Date-Modified sort matches).
It's regenerated at the end of each `--execute` pass, *after* that playlist's
download finishes — so on a big first download it appears per-playlist as each
completes. To rebuild the `.m3u8` / covers / mtimes immediately from files you
already have, without downloading or syncing:

```bash
uv run main.py --refresh-local        # fast; no spotDL, no Apple/YT
```

**Resumable & incremental.** After the first full download, only the tracks
you *newly added* are fetched — spotDL is handed just those tracks' URLs
(`spotdl download`), so it skips the whole-playlist re-processing that `sync`
does. Tracks you removed are deleted locally (their emptied album folders are
pruned), already-downloaded files are skipped (`--overwrite skip`), and an
interrupted run just continues next pass. The Spotify playlist cover is saved
at the highest resolution Spotify offers and refreshed only when it changes.

**spotDL is only invoked when it's actually needed.** Per-playlist state in
`download_state.json` (Spotify `snapshot_id`, a track-id → file map, and the set
of tracks spotDL couldn't source) drives it: an **unchanged** playlist is
skipped outright; a **changed** one downloads only the genuinely **new** tracks
(by URL) and deletes the **removed** ones — it does *not* re-run for
permanently-unavailable tracks (OSTs / kanji titles / region-locked songs that
aren't on YouTube), which are remembered after the first attempt. So steady
state is fast: adding a song fetches just that song, not the whole playlist.
(Use `--refresh-local` to force-rebuild the m3u/tags/covers without downloading.)

**Metadata for Jellyfin.** spotDL embeds full Spotify tags + cover art on
download. On top of that, finalize **backfills any missing** tags
(title/artist/album/albumartist/ISRC) and cover art from Spotify — fixing the
occasional poorly-tagged file (e.g. a YouTube-sourced one) without overwriting
what spotDL wrote — and drops a `cover.jpg` in each album folder so Jellyfin
always has album art. Set `LOCAL_MIRROR_TAG_BACKFILL=0` to disable.

**Hard-to-find tracks.** spotDL falls back from YouTube Music to plain YouTube
(`LOCAL_MIRROR_AUDIO_PROVIDERS`), which recovers most OSTs / instrumentals /
indie tracks that aren't YT Music catalog songs. Some genuinely-unavailable
tracks still log `no audio source` and are skipped.

Optional env: `LOCAL_MIRROR_FORMAT` (mp3 default; changing it after the first
run orphans old files), `LOCAL_MIRROR_TIMEOUT` (seconds per playlist per pass,
default 3600), `LOCAL_MIRROR_ORDER` (newest/oldest),
`LOCAL_MIRROR_AUDIO_PROVIDERS`, `LOCAL_MIRROR_VERBOSE=1` (echo all spotDL output).

**Audio quality.** The source is YouTube, so without a logged-in YT Music
**Premium** account the ceiling is ~128–160 kbps — no `--bitrate` can add
quality the source lacks. For better results: `LOCAL_MIRROR_FORMAT=opus` keeps
YouTube's native ~160 kbps stream without an mp3 re-encode; and for genuine
256 kbps AAC, export a YT Music Premium cookie file (yt-dlp format) and set
`LOCAL_MIRROR_COOKIE_FILE=/path/cookies.txt`. `LOCAL_MIRROR_BITRATE` (e.g.
`320k`, or `disable` to copy the source) tunes the transcode.

**Playlist covers in Jellyfin.** Jellyfin *ignores* any cover file next to an
m3u playlist — it auto-tiles the tracks' embedded art. The only way to set a
real playlist cover is Jellyfin's API, so this is opt-in: set `JELLYFIN_URL`
and `JELLYFIN_API_KEY` (Jellyfin → Dashboard → API Keys) and each `--execute`
pass uploads the Spotify cover onto the matching Jellyfin playlist. The
playlist must already exist in Jellyfin (scanned from the m3u), so the flow is:
sync → Jellyfin library scan → next sync sets covers. From Docker, point
`JELLYFIN_URL` at `http://host.docker.internal:8096`.

Download-mirror caveats:

- **Private playlists fail** in spotDL's default auth — make mirrored playlists
  public/unlisted, or do one interactive `uv run spotdl --user-auth ...` run;
  failures are logged per playlist and skipped.
- First run is slow (~10–30 s per track, YouTube throttling); later passes only
  touch deltas.
- Occasional wrong match (live/cover version) is inherent to YouTube sourcing.
- Renaming a playlist on Spotify starts a fresh folder; delete the old one
  manually. Each folder's `.sync.spotdl` is spotDL's sync state — keep it.
- Downloading audio this way is for personal use of content you have access
  to; it sits outside Spotify's ToS — your call.

## Caching & fast re-runs

Everything resolvable is cached so steady-state passes are near-instant:

- `apple_resolve_cache.json` / `ytmusic_resolve_cache.json` — ISRC and search
  resolutions, including misses (delete a file to force fresh matching).
- `spotify_tracks_cache.json` — each playlist's full track list keyed by
  Spotify's `snapshot_id`, so an unchanged playlist isn't re-paginated every
  pass. `snapshot_id` changes exactly when the playlist does, so there's no
  staleness (unlike a time-based cache).
- Apple requests reuse one pooled keep-alive connection per pass and back off
  on resets/429s — the fix for `ConnectionReset` under a big playlist's many
  calls.
- `song_cache.db → links` — Spotify id → Apple catalog id / YT videoId for
  every successful match. Hard identifiers beat title matching on later passes;
  delete a row if a linked id ever goes stale.
- `song_cache.db → sync_state` — after a fully clean `--execute` pass, each
  pair's Spotify `snapshot_id` is stored; while it's unchanged the pair is
  skipped entirely (logged as `unchanged since last clean sync`). Dry runs
  never skip and never write state, so `uv run main.py` always shows the full
  picture. Note: manual Apple-side edits on a skipped pair aren't corrected
  until the Spotify playlist next changes (YT-side edits are caught via track
  count).

## Song metadata archive

Every pass archives the metadata of every track it sees (all services) into
`song_cache.db` — a SQLite file that only ever grows. Tracks removed from your
playlists stay archived with name, artist, album, duration, ISRC, the full raw
snapshot JSON, and first/last-seen timestamps. Inspect it with e.g.:

```bash
sqlite3 song_cache.db "SELECT name, artist, album, first_seen FROM songs ORDER BY first_seen DESC LIMIT 20"
```

## Safety rails

Removals are destructive, so they're guarded:

- **Dry run is the default** — nothing changes without `--execute`.
- If Spotify returns 0 tracks for a playlist the target shows as non-empty,
  removals are skipped that pass (a transient API failure can't empty a
  playlist).
- More than `MAX_REMOVALS` pending removals in one pass → removals are skipped
  and logged; raise the cap deliberately if the change was intentional.
- More than `MAX_ADDS` pending additions → the rest continue next pass
  (giant one-burst backfills are what trip bot detection).
- Fuzzy title/artist protection: a target-side track that plausibly matches a
  Spotify track (metadata drift like `feat.` credits) is never removed.
- Net-loss protection: a target-side track resembling a Spotify track that has
  no match on that service is held (`~ held` in the log) — deleting it would
  drop the song with no replacement.
- Any Apple `401/403` aborts the pass immediately — no partial deletes on
  expired tokens. YT `403/429` rate limits back off exponentially and resume.

## Caveats

- Adding a catalog song to an Apple playlist may also add it to your Apple
  Music library — that's an Apple account setting ("Add Playlist Songs to
  Library"), not something the API controls.
- Tracks with no match on a service are reported (`x Not on ...`) each pass
  and otherwise skipped.
- Playlist cover art isn't copied — neither Apple nor YT Music exposes artwork
  upload; both auto-generate a mosaic cover from the tracks.

## Project layout

Runnable as `uv run main.py` (thin shim) or `python -m spotify_mirror`.

```text
spotify_mirror/
  cli.py         # entry: parse args, run once or loop
  runner.py      # build targets, run each in its own thread, then downloads
  config.py      # constants, env, CLI options
  spotify.py     # read-only source: client, playlists, tracks
  matching.py    # normalize / romanize / score / diff / removal guards
  archive.py     # SQLite: song archive + id links + snapshot state
  logs.py        # colourised, thread-safe, severity-tagged logging
  downloads.py   # spotDL local mirror + covers
  targets/
    base.py      # MirrorTarget interface + the shared mirror_pair loop
    apple.py     # Apple Music (amp-api)
    ytmusic.py   # YouTube Music (ytmusicapi)
```

**Adding a service** (Tidal, Deezer, ...): subclass `MirrorTarget`, implement
~8 methods (`list_playlists`, `playlist_tracks`, `track_id`, `resolve`, `add`,
`remove`, `create`, `is_editable`), and add its builder to
`targets/build_targets`. All the reconciliation — diff, ordering, safety rails,
logging, stats, snapshot-skip — is inherited from `base.mirror_pair`.

## Self-check

```bash
uv run test_matching.py
uv run python test_downloads.py
```

## Troubleshooting

- `Missing required environment variable: ...` — fill in `.env`
- `Apple rejected ... (401/403)` — re-capture the two Apple tokens
- `YT Music mirror unavailable` — re-run the `ytmusicapi browser` setup
- Spotify OAuth redirect mismatch — the dashboard redirect URI must exactly
  match `SPOTIFY_REDIRECT_URI`
- A playlist isn't syncing — confirm it's included in `PLAYLISTS` and exists
  on Spotify (targets are auto-created on `--execute`)

## License

[MIT](LICENSE)
