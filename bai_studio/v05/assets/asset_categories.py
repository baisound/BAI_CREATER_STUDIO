"""Read-only upload capabilities for v0.5; formats are enforced by legacy validator."""
from pathlib import Path
from bai_studio.assets.library_assets import FORMATS, MAX_UPLOAD, MAX_STAGE_UPLOAD
from bai_studio.v05.timeline.arrangement import CATEGORIES
from bai_studio.v05.render.media_render import IMAGE_EXT, VIDEO_EXT

def capabilities():
    return {'schema':1,'search_categories':sorted(CATEGORIES),
            'mp4_image_formats':sorted(ext.lstrip('.') for ext in IMAGE_EXT),
            'mp4_video_formats':sorted(ext.lstrip('.') for ext in VIDEO_EXT),
            'upload_formats':{ext:sorted(kinds) for ext,kinds in sorted(FORMATS.items())},
            'max_upload_bytes':MAX_UPLOAD,'max_stage_bytes':MAX_STAGE_UPLOAD,
            'upload_endpoint':'/api/library-assets/upload',
            'source_modes':['reference','copy'],
            'source_inbox':'data/asset_inbox (server-side relative paths only)',
            'reference_endpoint':'/api/studio/v05/asset-sources/register',
            'note':'Uploads require actual file bytes; MCP/WebMCP expose capabilities and search, not arbitrary local file reads.'}
