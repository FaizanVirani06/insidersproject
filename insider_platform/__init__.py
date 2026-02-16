"""Insider Trading Analysis Platform (SEC Form 4) - Backend.

This repository is intentionally backend-first:
- All computation happens in the backend.
- UI (later) is read-only: display + filter.

Core concepts:
- Atomic unit is an *insider event* (issuer_cik, owner_key, accession_number)
- Buys and sells are symmetric; open-market P/S are the key signals.

See README for setup and usage.
"""

__all__ = ["__version__"]

__version__ = "0.1.0"
