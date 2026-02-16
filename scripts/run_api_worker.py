import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from insider_platform.config import load_config
from insider_platform.jobs.worker import API_JOB_TYPES, run_worker_forever


def main() -> None:
    cfg = load_config()
    run_worker_forever(cfg.DB_DSN, cfg, allowed_job_types=API_JOB_TYPES, enable_poller=True)


if __name__ == "__main__":
    main()
