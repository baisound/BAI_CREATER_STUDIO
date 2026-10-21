"""Generate the WP-06b camera.html ID placement inventory without rewriting markup."""

from __future__ import annotations

import json
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}
CENTER_ASSET_IDS = {'camera-asset', 'camera-load-asset', 'camera-clip', 'camera-asset-status'}


def placement(ancestors: list[dict[str, str]], element_id: str) -> str:
    classes = {name for attrs in ancestors for name in attrs.get('class', '').split()}
    ids = {attrs.get('id') for attrs in ancestors}
    tags = {attrs.get('_tag') for attrs in ancestors}
    if 'header' in tags:
        return 'toolbar'
    if 'asset-toolbar' in classes:
        return 'center' if element_id in CENTER_ASSET_IDS else 'focus'
    if 'dual-views' in classes:
        return 'center'
    if 'transport' in classes or 'timeline' in classes:
        return 'timeline'
    if 'camera-custom-presets' in ids or 'camera-sequence-editor' in ids or element_id in {'camera-custom-presets', 'camera-sequence-editor'}:
        return 'shots'
    if 'camera-rig-panel' in ids or element_id == 'camera-rig-panel':
        return 'rail'
    if 'framing-test' in classes or 'focus-test' in classes:
        return 'focus'
    if element_id == 'interpolation':
        return 'interpolation'
    return 'camera'


class IdParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.stack: list[dict[str, str]] = []
        self.items: list[dict[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        data = {'_tag': tag, **{key: value or '' for key, value in attrs}}
        if data.get('id'):
            self.items.append({'id': data['id'], 'slot': placement(self.stack, data['id'])})
        if tag not in VOID:
            self.stack.append(data)

    def handle_endtag(self, tag: str) -> None:
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index]['_tag'] == tag:
                del self.stack[index:]
                return


def main() -> None:
    parser = IdParser()
    parser.feed((ROOT / 'camera.html').read_text(encoding='utf-8'))
    ids = [item['id'] for item in parser.items]
    if len(ids) != len(set(ids)):
        raise SystemExit('camera.html has duplicate IDs')
    destination = ROOT / 'studio/js/camera/legacy-ids.json'
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps({'source': 'camera.html', 'count': len(ids), 'elements': parser.items}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{len(ids)} IDs -> {destination.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
