"""Entry point: parse args, run one pass or loop forever."""

import sys
import time

from dotenv import load_dotenv

from .config import parse_args
from .logs import fmt_secs, log_note, log_warn
from .runner import run_pass
from .targets import TargetAuthError


def main(argv=None):
    load_dotenv()  # so CLI defaults can read .env; run_pass reloads per pass
    opts = parse_args(argv)
    while True:
        try:
            run_pass(opts)
        except TargetAuthError as e:
            log_warn(str(e))
            if not opts.loop:
                sys.exit(2)
        except Exception as e:
            if not opts.loop:
                raise
            log_warn(f"pass failed: {e!r}")
        if not opts.loop:
            break
        log_note(f"next pass in {fmt_secs(opts.interval_s)}")
        time.sleep(opts.interval_s)
