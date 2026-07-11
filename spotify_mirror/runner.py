"""Orchestration: build targets, run each in its own thread against the
selected playlists, then the optional local download mirror.

Targets run concurrently (separate hosts, separate rate limits) but each stays
internally sequential to preserve append order and avoid robotic bursts.
"""

import json
import threading
import time

from dotenv import load_dotenv

from . import archive, spotify
from .logs import fmt_counts, fmt_secs, log, log_note, log_section, log_summary, log_warn, paint
from .targets import TargetAuthError, build_targets, mirror_pair


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


def run_target(target, selected, get_sp_tracks, songs, opts):
    """Mirror every selected playlist to one target. Returns an aggregate dict.
    Raises TargetAuthError to abort the whole target (fail closed)."""
    agg = {"name": target.name, "pairs": 0, "added": 0, "removed": 0,
           "missing": 0, "held": 0, "skipped": 0, "created": 0}
    cache = load_cache(target.cache_file)
    try:
        tgt_by_name = target.list_playlists()
        for sp_playlist in selected:
            key = sp_playlist["name"].strip().casefold()
            tgt = tgt_by_name.get(key)
            if not tgt:
                if not opts.execute:
                    log_note(f"{sp_playlist['name']}: no {target.name} playlist yet - would create on --execute", tag=target.tag)
                    continue
                try:
                    tgt = target.create(sp_playlist)
                    agg["created"] += 1
                    log_note(f"created {target.name} playlist '{sp_playlist['name']}' (name + description copied)", tag=target.tag)
                except Exception as e:
                    log_warn(f"create '{sp_playlist['name']}' failed: {e!r}", tag=target.tag)
                    continue

            snapshot = sp_playlist.get("snapshot_id")
            if opts.execute and snapshot:
                state = archive.get_state(songs, key, target.source)
                current = target.playlist_count(tgt)
                if state and state[0] == snapshot and (state[1] is None or current is None or current == state[1]):
                    log_note(f"{sp_playlist['name']}: unchanged since last sync - skipped", tag=target.tag)
                    agg["skipped"] += 1
                    continue

            if not target.is_editable(tgt):
                log_warn(f"'{sp_playlist['name']}': {target.name} playlist not editable - skipped", tag=target.tag)
                continue

            try:
                res = mirror_pair(
                    target, get_sp_tracks(sp_playlist["id"]), sp_playlist, tgt, cache, songs,
                    execute=opts.execute, max_removals=opts.max_removals, max_adds=opts.max_adds,
                )
                agg["pairs"] += 1
                for k in ("added", "removed", "missing", "held"):
                    agg[k] += res[k]
                if res["clean"] and snapshot:
                    archive.set_state(songs, key, target.source, snapshot, res["target_count"])
            except TargetAuthError:
                raise
            except Exception as e:
                log_warn(f"'{sp_playlist.get('name', '?')}' failed, continuing: {e!r}", tag=target.tag)
    finally:
        save_cache(target.cache_file, cache)
    return agg


def run_pass(opts):
    load_dotenv(override=True)  # pick up re-captured tokens without a restart
    sp = spotify.client()
    sp_by_name = spotify.playlists_by_name(sp)

    wanted = {n.strip().casefold() for n in opts.playlists.split(",") if n.strip()} if opts.playlists else None
    selected = [sp_by_name[n] for n in sorted(sp_by_name) if wanted is None or n in wanted]

    mode = paint("EXECUTE", "green", "bold") if opts.execute else paint("DRY RUN", "yellow", "bold")
    log(paint("═══ Spotify playlist mirror ═══", "bold", "cyan"))
    log(f"  mode: {mode}")
    log(f"  playlists: {paint(str(len(selected)), 'bold')} selected"
        + (paint(f" ({', '.join(p['name'] for p in selected)})", "grey") if selected else ""))
    if wanted:
        missing = wanted - {p["name"].strip().casefold() for p in selected}
        if missing:
            log_warn(f"not found on Spotify: {', '.join(sorted(missing))}", indent="  ")

    targets = build_targets(opts)
    if not targets:
        log_warn("no mirror targets configured (set Apple tokens and/or YouTube Music auth)", indent="  ")
        return
    log(f"  targets: {paint(', '.join(t.name for t in targets), 'cyan')}"
        + (paint(f"   local downloads -> {opts.download_dir}", "grey") if opts.download_dir and opts.execute else ""))

    songs = archive.connect(opts.song_cache_file)
    sp_memo, sp_lock = {}, threading.Lock()

    def get_sp_tracks(playlist_id):
        # Lock guards the memo AND serialises the shared spotipy client.
        with sp_lock:
            if playlist_id not in sp_memo:
                sp_memo[playlist_id] = spotify.playlist_tracks(sp, playlist_id)
            return sp_memo[playlist_id]

    results, errors = {}, []

    def worker(target):
        try:
            results[target.tag] = run_target(target, selected, get_sp_tracks, songs, opts)
        except BaseException as e:  # surface after siblings finish
            errors.append((target, e))

    started = time.monotonic()
    threads = [threading.Thread(target=worker, args=(t,), name=f"{t.tag}-mirror") for t in targets]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    songs.close()

    log_section("Pass complete", fmt_secs(time.monotonic() - started))
    for target in targets:
        agg = results.get(target.tag)
        if not agg:
            continue
        notes = []
        if agg["created"]:
            notes.append(f"{agg['created']} created")
        if agg["skipped"]:
            notes.append(f"{agg['skipped']} unchanged")
        tail = f"  across {agg['pairs']} playlist(s)" + (f" ({', '.join(notes)})" if notes else "")
        log_summary(f"{target.name:<14} {fmt_counts(agg['added'], agg['removed'], agg['missing'], agg['held'])}"
                    + paint(tail, "grey"), indent="  ")

    for target, err in errors:
        if isinstance(err, TargetAuthError):
            raise err  # fatal; main() decides exit vs. loop-continue

    if opts.download_dir and opts.execute:
        try:
            from . import downloads

            downloads.run(sp, selected, opts.download_dir)
        except Exception as e:
            log_warn(f"local download mirror failed (playlist sync unaffected): {e!r}", tag="local")
