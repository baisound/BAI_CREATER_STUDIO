"""Kenney CC0 ZIPs already downloaded into data/sample_imports_20261021.

Extract a small, self-contained review set without changing the source ZIPs.
Outputs are ignored by Git; provenance is written beside them.
"""
import hashlib
import json
import shutil
import struct
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data' / 'sample_imports_20261021'
READY = SOURCE / 'ready'

PACKS = {
    'platformer': ('kenney_platformer-kit.zip', 'https://kenney.nl/assets/platformer-kit', 'https://kenney.nl/media/pages/assets/platformer-kit/1585cf62b4-1775122253/kenney_platformer-kit.zip'),
    'factory': ('kenney_factory-kit_3.0.zip', 'https://kenney.nl/assets/factory-kit', 'https://kenney.nl/media/pages/assets/factory-kit/edaac9d4f6-1777639602/kenney_factory-kit_3.0.zip'),
    'particles': ('kenney_particle-pack.zip', 'https://kenney.nl/assets/particle-pack', 'https://kenney.nl/media/pages/assets/particle-pack/f8fe0f8cb8-1677578741/kenney_particle-pack.zip'),
    'audio': ('kenney_ui-audio.zip', 'https://kenney.nl/assets/ui-audio', 'https://kenney.nl/media/pages/assets/ui-audio/490d233f68-1677590494/kenney_ui-audio.zip'),
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def put(path, data):
    if path.exists():
        if path.read_bytes() != data:
            raise RuntimeError(f'existing sample differs: {path}')
    else:
        path.write_bytes(data)


def self_contained_glb(raw, texture):
    if raw[:4] != b'glTF' or struct.unpack_from('<I', raw, 4)[0] != 2:
        raise ValueError('not GLB v2')
    pos = 12
    chunks = []
    while pos < len(raw):
        size, kind = struct.unpack_from('<I4s', raw, pos)
        chunks.append((kind, raw[pos + 8:pos + 8 + size]))
        pos += 8 + size
    if [x[0] for x in chunks] != [b'JSON', b'BIN\0']:
        raise ValueError('unexpected GLB chunks')
    model = json.loads(chunks[0][1]); binary = chunks[1][1]
    if len(model.get('images', [])) != 1 or model['images'][0].get('uri') != 'Textures/colormap.png':
        raise ValueError('unexpected image reference')
    offset = len(binary)
    binary += texture
    binary += b'\0' * (-len(binary) % 4)
    model['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(texture)})
    model['images'][0] = {'bufferView': len(model['bufferViews']) - 1, 'mimeType': 'image/png', 'name': 'colormap'}
    model['buffers'][0]['byteLength'] = len(binary)
    data = json.dumps(model, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    data += b' ' * (-len(data) % 4)
    result = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(data) + 8 + len(binary))
    result += struct.pack('<I4s', len(data), b'JSON') + data
    result += struct.pack('<I4s', len(binary), b'BIN\0') + binary
    return result


def main():
    READY.mkdir(parents=True, exist_ok=True)
    sources = {}
    outputs = []
    for key, (filename, page, url) in PACKS.items():
        archive = SOURCE / filename
        if not archive.is_file():
            raise FileNotFoundError(archive)
        sources[key] = {'archive': filename, 'sha256': sha(archive.read_bytes()), 'page': page, 'downloadUrl': url, 'license': 'CC0 1.0 (source page and License.txt)'}

    def extract(pack, member, name, category, transform=None):
        with zipfile.ZipFile(SOURCE / PACKS[pack][0]) as archive:
            original = archive.read(member)
            content = transform(original, archive) if transform else original
        put(READY / name, content)
        outputs.append({'file': name, 'kind': category, 'pack': pack, 'member': member, 'sourceSha256': sha(original), 'sha256': sha(content), 'bytes': len(content), 'transform': 'embed colormap PNG in GLB' if transform else 'none'})

    extract('platformer', 'Models/GLB format/block-grass-large.glb', 'kenney_grass_stage.glb', 'stage',
            lambda raw, z: self_contained_glb(raw, z.read('Models/GLB format/Textures/colormap.png')))
    extract('factory', 'Models/GLB format/machine.glb', 'kenney_machine_prop.glb', 'prop',
            lambda raw, z: self_contained_glb(raw, z.read('Models/GLB format/Textures/colormap.png')))
    extract('factory', 'Models/GLB format/Textures/colormap.png', 'kenney_factory_colormap.png', 'material')
    extract('particles', 'PNG (Transparent)/magic_01.png', 'kenney_magic_effect.png', 'fx')
    extract('platformer', 'Preview.png', 'kenney_platformer_image.png', 'image')
    extract('audio', 'Audio/click1.ogg', 'kenney_click1_source.ogg', 'source')
    extract('audio', 'Preview.ogg', 'kenney_audio_preview_source.ogg', 'source')

    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        raise RuntimeError('ffmpeg is needed to make WAV, MP3 and MP4 samples')
    conversions = [
        ('kenney_click1_source.ogg', 'kenney_click1.wav', ['-ac', '1', '-ar', '22050'], 'audio'),
        ('kenney_audio_preview_source.ogg', 'kenney_ui_audio_preview.mp3', ['-c:a', 'libmp3lame', '-q:a', '5', '-metadata', 'title=Kenney UI Audio Preview'], 'audio'),
        ('kenney_platformer_image.png', 'kenney_platformer_demo.mp4', ['-t', '3', '-vf', 'scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-metadata', 'title=Kenney Platformer Demo'], 'video'),
    ]
    for src, name, opts, category in conversions:
        target = READY / name
        if not target.exists():
            input_opts = ['-loop', '1', '-framerate', '12'] if category == 'video' else []
            subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', *input_opts, '-i', str(READY / src), *opts, str(target)], check=True)
        pack = 'audio' if category == 'audio' else 'platformer'
        outputs.append({'file': name, 'kind': category, 'pack': pack, 'member': src, 'sourceSha256': sha((READY / src).read_bytes()), 'sha256': sha(target.read_bytes()), 'bytes': target.stat().st_size, 'transform': 'ffmpeg conversion with title metadata' if name.endswith(('.mp3', '.mp4')) else 'ffmpeg WAV conversion'})
    manifest = {'date': '2026-10-21', 'sources': sources, 'outputs': outputs}
    (READY / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
