"""Read registered PMX morph names without changing the source file."""
from __future__ import annotations
import json
import shutil
import subprocess
from pathlib import Path


def names(source: Path) -> set[str]:
    if source is None:
        raise ValueError("PMX morph inspection is unavailable")
    source = Path(source)
    helper = Path(__file__).resolve().parent / "tools" / "pmx_morph_names.mjs"
    node = shutil.which("node")
    if not node or not source.is_file() or source.suffix.lower() != ".pmx" \
            or source.stat().st_size > 300 * 1024 * 1024 or not helper.is_file():
        raise ValueError("PMX morph inspection is unavailable")
    try:
        result = subprocess.run([node, str(helper), str(source)], capture_output=True,
                                text=True, encoding="utf-8", errors="replace", timeout=30,
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if result.returncode or len(result.stdout) > 200000:
            raise ValueError("PMX morph inspection failed")
        data = json.loads(result.stdout)
        if not isinstance(data, list) or len(data) > 10000 or any(
                not isinstance(name, str) or not name for name in data):
            raise ValueError("PMX morph list is invalid")
        return set(data)
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
        raise ValueError("PMX morph inspection failed") from exc
