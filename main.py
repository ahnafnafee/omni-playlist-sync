"""Thin entry shim so `uv run main.py` keeps working; logic lives in the
spotify_mirror package (also runnable as `python -m spotify_mirror`)."""

from spotify_mirror.cli import main

if __name__ == "__main__":
    main()
