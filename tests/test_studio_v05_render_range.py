import json
import tempfile
import unittest
from pathlib import Path

from studio_project_catalog import create, set_fps
from studio_v05_arrangement import place, edit_clip, read as read_arrangement
from studio_v05_render_range import read, save, RenderRangeError


class RenderRangeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.catalog = self.root / 'catalog.json'
        self.arrangements = self.root / 'arrangements'
        self.ranges = self.root / 'ranges'
        self.project = create(self.catalog, '範囲確認')['id']
        self.other = create(self.catalog, '別作品')['id']
        self.items = [{'id': 'library:video', 'name': 'clip.mp4', 'kind': 'video',
                       'source': 'library', 'available': True}]

    def tearDown(self):
        self.temp.cleanup()

    def clip(self, start=0, duration=5):
        revision = read_arrangement(self.arrangements, self.catalog, self.project)['revision']
        return place(self.arrangements, self.catalog, self.project,
                     'library:video', 'video', start, duration, revision, self.items)

    def test_default_range_tracks_last_frame_without_writing(self):
        empty = read(self.ranges, self.arrangements, self.catalog, self.project)
        self.assertEqual((empty['effective_in_frame'], empty['effective_out_frame'],
                          empty['range_end_exclusive'], empty['frame_count'], empty['has_clips']),
                         (0, 0, 1, 1, False))
        self.assertFalse(self.ranges.exists())
        self.clip(0, 5)
        result = read(self.ranges, self.arrangements, self.catalog, self.project)
        self.assertEqual((result['fps'], result['final_frame'], result['range_end_exclusive'],
                          result['frame_count']), (60, 299, 300, 300))

    def test_save_restore_and_unset_markers_are_project_scoped(self):
        self.clip()
        prior = read(self.ranges, self.arrangements, self.catalog, self.project)
        saved = save(self.ranges, self.arrangements, self.catalog, self.project,
                     prior['revision'], prior['arrangement_revision'], 30, 119)
        self.assertEqual((saved['range_start_frame'], saved['range_end_exclusive'],
                          saved['frame_count']), (30, 120, 90))
        self.assertEqual(read(self.ranges, self.arrangements, self.catalog, self.project)['out_frame'], 119)
        self.assertIsNone(read(self.ranges, self.arrangements, self.catalog, self.other)['out_frame'])
        reset = save(self.ranges, self.arrangements, self.catalog, self.project,
                     saved['revision'], saved['arrangement_revision'], None, None)
        self.assertEqual((reset['range_start_frame'], reset['range_end_exclusive']), (0, 300))

    def test_fps_and_fractional_clip_end(self):
        set_fps(self.catalog, self.project, 29.97)
        self.clip(0, 1.001)
        result = read(self.ranges, self.arrangements, self.catalog, self.project)
        self.assertEqual((result['fps'], result['final_frame'], result['range_end_exclusive']),
                         (29.97, 29, 30))

    def test_conflicts_and_invalid_ranges_preserve_saved_file(self):
        self.clip()
        prior = read(self.ranges, self.arrangements, self.catalog, self.project)
        saved = save(self.ranges, self.arrangements, self.catalog, self.project,
                     prior['revision'], prior['arrangement_revision'], 20, 40)
        original = (self.ranges / (self.project + '.json')).read_bytes()
        for markers in ((41, 40), (0, 300), (True, 40), (-1, None)):
            with self.assertRaises(RenderRangeError):
                save(self.ranges, self.arrangements, self.catalog, self.project,
                     saved['revision'], saved['arrangement_revision'], *markers)
            self.assertEqual((self.ranges / (self.project + '.json')).read_bytes(), original)
        with self.assertRaisesRegex(RenderRangeError, 'conflict'):
            save(self.ranges, self.arrangements, self.catalog, self.project,
                 prior['revision'], saved['arrangement_revision'], 0, 20)
        self.clip(5, 1)
        with self.assertRaisesRegex(RenderRangeError, 'conflict'):
            save(self.ranges, self.arrangements, self.catalog, self.project,
                 saved['revision'], saved['arrangement_revision'], 0, 20)
        self.assertEqual((self.ranges / (self.project + '.json')).read_bytes(), original)

    def test_clip_shrink_marks_existing_out_invalid_without_overwriting(self):
        placed = self.clip(0, 5)
        current = read(self.ranges, self.arrangements, self.catalog, self.project)
        save(self.ranges, self.arrangements, self.catalog, self.project,
             current['revision'], current['arrangement_revision'], 0, 250)
        edit_clip(self.arrangements, self.catalog, self.project, placed['clip']['id'],
                  placed['revision'], 'update', start=0, duration=2, track='video')
        result = read(self.ranges, self.arrangements, self.catalog, self.project)
        self.assertFalse(result['valid'])
        self.assertEqual(result['out_frame'], 250)
        self.assertEqual(result['final_frame'], 119)

    def test_corrupt_file_is_retained(self):
        self.ranges.mkdir()
        path = self.ranges / (self.project + '.json')
        path.write_text('{invalid', encoding='utf-8')
        with self.assertRaises(RenderRangeError):
            read(self.ranges, self.arrangements, self.catalog, self.project)
        self.assertEqual(path.read_text(encoding='utf-8'), '{invalid')


if __name__ == '__main__':
    unittest.main()
