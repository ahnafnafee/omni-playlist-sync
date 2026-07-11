"""Console logging: colourised, severity-tagged, thread-safe.

Colour is emitted only on an interactive terminal (and never when NO_COLOR is
set), so `docker compose logs`, file redirects and pipes stay clean. All output
goes through one lock so the concurrent Apple / YouTube mirror threads never
interleave mid-line.
"""

import os
import sys
import threading
from datetime import datetime

# Track titles are arbitrary Unicode; Windows consoles default to cp1252 and
# would crash on the first Cyrillic/CJK title without this.
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

_COLOR = sys.stdout.isatty() and os.getenv("NO_COLOR") is None and os.getenv("TERM") != "dumb"
_ANSI = {
    "reset": "\033[0m", "dim": "\033[2m", "bold": "\033[1m",
    "red": "\033[31m", "green": "\033[32m", "yellow": "\033[33m",
    "blue": "\033[34m", "cyan": "\033[36m", "grey": "\033[90m",
}
_lock = threading.Lock()


def paint(text, *styles):
    if not _COLOR or not styles:
        return str(text)
    return "".join(_ANSI[s] for s in styles) + str(text) + _ANSI["reset"]


def log(message="", *, tag=None, tag_styles=("grey",)):
    """One timestamped line. `tag` is a short service label (apple/yt/local)
    kept to the right of the clock so interleaved threads stay readable."""
    prefix = paint(f"[{datetime.now():%H:%M:%S}]", "grey") + " "
    if tag:
        prefix += paint(f"{tag:<6}", *tag_styles) + " "
    with _lock:
        print(f"{prefix}{message}", flush=True)


def log_section(title, detail="", *, tag=None):
    log("")  # tagless blank separator
    line = paint(f"■ {title}", "bold", "cyan")
    if detail:
        line += "  " + paint(detail, "grey")
    log(line, tag=tag)


def log_event(symbol, message, *styles, tag=None, indent="   "):
    log(f"{indent}{paint(symbol, *styles)} {message}", tag=tag)


def log_add(msg, *, dry=False, tag=None, indent="   "):
    log_event("+", msg + (paint("  (dry run)", "grey") if dry else ""), "green", tag=tag, indent=indent)


def log_remove(msg, *, dry=False, tag=None, indent="   "):
    log_event("-", msg + (paint("  (dry run)", "grey") if dry else ""), "red", tag=tag, indent=indent)


def log_hold(msg, *, tag=None, indent="   "):
    log_event("~", paint(msg, "yellow"), "yellow", tag=tag, indent=indent)


def log_miss(msg, *, tag=None, indent="   "):
    log_event("x", paint(msg, "grey"), "grey", tag=tag, indent=indent)


def log_warn(msg, *, tag=None, indent="   "):
    log_event("!", paint(msg, "yellow", "bold"), "yellow", "bold", tag=tag, indent=indent)


def log_note(msg, *, tag=None, indent="   "):
    log_event(".", paint(msg, "grey"), "grey", tag=tag, indent=indent)


def log_download(msg, *, tag=None, indent="   "):
    log_event("v", paint(msg, "blue"), "blue", tag=tag, indent=indent)


def log_summary(msg, *, tag=None, indent=" "):
    log_event("=", paint(msg, "bold"), "bold", indent=indent, tag=tag)


def fmt_counts(added, removed, missing=0, held=0, deferred=0):
    parts = [paint(f"+{added}", "green", "bold"), paint(f"-{removed}", "red", "bold")]
    extra = []
    if missing:
        extra.append(f"{missing} missing")
    if held:
        extra.append(f"{held} held")
    if deferred:
        extra.append(f"{deferred} deferred")
    tail = f"  ({', '.join(extra)})" if extra else ""
    return " ".join(parts) + paint(tail, "grey")


def fmt_secs(seconds):
    seconds = int(seconds)
    return f"{seconds}s" if seconds < 60 else f"{seconds // 60}m{seconds % 60:02d}s"
