"""Compatibility wrapper for the versioned Node.js IV pack builder."""

from __future__ import annotations

import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


if __name__ == "__main__":
    subprocess.run(["node", str(ROOT / "scripts" / "build_ivpack.mjs")], check=True)
