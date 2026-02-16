"""Create a user in the SQLite DB.

Usage:
  python scripts/create_user.py --username alice --password '...' --role user

NOTE: This is intended for local/dev.
"""

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from insider_platform.config import load_config
from insider_platform.db import init_db, connect
from insider_platform.auth.crud import create_user


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--username", required=True)
    ap.add_argument("--password", required=True)
    ap.add_argument("--role", choices=["user", "admin"], default="user")
    args = ap.parse_args()

    cfg = load_config()
    init_db(cfg.DB_DSN)

    with connect(cfg.DB_DSN) as conn:
        u = create_user(conn, username=args.username, password=args.password, role=args.role)

    print("Created user:")
    print(u)


if __name__ == "__main__":
    main()
