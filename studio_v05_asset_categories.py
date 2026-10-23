"""Read-only upload capabilities for v0.5; formats are enforced by legacy validator."""
from pathlib import Path
from library_assets import FORMATS, MAX_UPLOAD, MAX_STAGE_UPLOAD
from studio_v05_arrangement import CATEGORIES

def capabilities():
    return {'schema':1,'search_categories':sorted(CATEGORIES),
            'upload_formats':{ext:sorted(kinds) for ext,kinds in sorted(FORMATS.items())},
            'max_upload_bytes':MAX_UPLOAD,'max_stage_bytes':MAX_STAGE_UPLOAD,
            'upload_endpoint':'/api/library-assets/upload',
            'note':'Uploads require actual file bytes; MCP/WebMCP expose capabilities and search, not arbitrary local file reads.'}
