import copy
import unittest
from bai_camera import DEFAULT, validate


class SequenceTests(unittest.TestCase):
    def project(self):
        p = copy.deepcopy(DEFAULT)
        p['custom_presets'] = [{'name': 'Face', 'pose': {'position': [0, 1, 3], 'target': [0, 1, 0], 'fov': 35}}]
        p['sequence'] = [{'start': 0, 'end': 60, 'preset': 'Face'}, {'start': 60, 'end': 90, 'preset': 'Face'}]
        return p

    def test_roundtrip(self):
        p = self.project()
        self.assertEqual(validate(validate(p))['sequence'], p['sequence'] if all('transition' in x for x in p['sequence']) else [{'start': 0, 'end': 60, 'preset': 'Face', 'transition': 'cut'}, {'start': 60, 'end': 90, 'preset': 'Face', 'transition': 'cut'}])

    def test_overlap_rejected(self):
        p = self.project(); p['sequence'][1]['start'] = 59
        with self.assertRaises(ValueError): validate(p)

    def test_missing_preset_rejected(self):
        p = self.project(); p['sequence'][0]['preset'] = 'Missing'
        with self.assertRaises(ValueError): validate(p)

    def test_invalid_bounds_rejected(self):
        p = self.project(); p['sequence'][0]['end'] = 301
        with self.assertRaises(ValueError): validate(p)

    def test_legacy_untouched(self):
        self.assertNotIn('sequence', validate(copy.deepcopy(DEFAULT)))


if __name__ == '__main__': unittest.main()
