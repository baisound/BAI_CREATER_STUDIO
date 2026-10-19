# New UI shell (P1-B mock) routing. Standard library only, read-only static serving.
import re
from pathlib import Path

STUDIO_DIR = Path(__file__).resolve().parent / 'studio'
STUDIO_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
}
# /workspace, /workspace/, /workspace/01 .. /workspace/25 (extra segments are not routes)
WORKSPACE_ROUTE = re.compile(r'^/workspace(?:/(?:\d{2})?)?/?$')


def resolve(path, root=STUDIO_DIR):
    """Return (file, content_type) for a studio URL path, or None if it is not a studio file.

    `/workspace/NN` always serves the shell so reload and direct URLs open the same screen;
    the shell itself shows "not found" for numbers outside 01..25.
    """
    if WORKSPACE_ROUTE.match(path):
        return root / 'index.html', STUDIO_TYPES['.html']
    if not path.startswith('/studio/'):
        return None
    rel = path[len('/studio/'):] or 'index.html'
    parts = rel.split('/')
    if any(p in ('', '.', '..') or p.startswith('.') for p in parts) or '\\' in rel:
        return None
    file = (root / rel).resolve()
    try:
        file.relative_to(root.resolve())
    except ValueError:
        return None
    ctype = STUDIO_TYPES.get(file.suffix.lower())
    if ctype is None or not file.is_file():
        return None
    return file, ctype
