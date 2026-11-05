import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import studio_v05_render_names as names
import studio_v05_media_render as render


class RenderNamesSafetyTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "renders"
        (self.root / "jobs").mkdir(parents=True)
        (self.root / "files").mkdir()
        self.project = "test-project"

    def completed(self, job_id, content):
        path = self.root / "files" / f"{job_id}.mp4"
        path.write_bytes(content)
        (self.root / "jobs" / f"{job_id}.json").write_text(json.dumps({
            "id": job_id, "project_id": self.project, "status": "succeeded",
            "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest(),
        }), encoding="utf-8")
        return path

    def test_failed_atomic_replacement_keeps_current_file_and_index(self):
        old_id, new_id = "a" * 32, "b" * 32
        first = names.plan(self.root, self.project, "作品", "version", None)
        temp = self.root / "files" / "first.part.mp4"
        temp.write_bytes(b"old MP4 bytes")
        names.finalize(self.root, self.project, first, old_id, temp,
                       self.root / "files" / f"{old_id}.mp4")
        old = self.completed(old_id, b"old MP4 bytes")
        before = names.preview(self.root, self.project, "作品")
        replacement = names.plan(self.root, self.project, "作品", "replace", old_id)
        new_temp = self.root / "files" / "new.part.mp4"
        new_final = self.root / "files" / f"{new_id}.mp4"
        new_temp.write_bytes(b"new MP4 bytes")
        with patch.object(names, "_atomic", side_effect=OSError("simulated index write failure")):
            with self.assertRaises(OSError):
                names.finalize(self.root, self.project, replacement, new_id, new_temp, new_final)
        self.assertEqual(names.preview(self.root, self.project, "作品"), before)
        self.assertEqual(old.read_bytes(), b"old MP4 bytes")
        self.assertFalse(new_final.exists())

    def test_restore_rejects_a_same_size_modified_backup(self):
        old_id, new_id = "c" * 32, "d" * 32
        first = names.plan(self.root, self.project, "完成", "version", None)
        first_temp = self.root / "files" / "first.part.mp4"
        first_temp.write_bytes(b"old MP4 bytes")
        names.finalize(self.root, self.project, first, old_id, first_temp,
                       self.root / "files" / f"{old_id}.mp4")
        old = self.completed(old_id, b"old MP4 bytes")
        replacement = names.plan(self.root, self.project, "完成", "replace", old_id)
        new_temp = self.root / "files" / "second.part.mp4"
        new_temp.write_bytes(b"new MP4 bytes")
        names.finalize(self.root, self.project, replacement, new_id, new_temp,
                       self.root / "files" / f"{new_id}.mp4")
        self.completed(new_id, b"new MP4 bytes")
        old.write_bytes(b"OLD MP4 bytes")
        before = names.preview(self.root, self.project, "完成")
        with self.assertRaisesRegex(names.NameError, "旧版を保持"):
            names.restore(self.root, self.project, "完成", old_id, before["revision"], new_id)
        self.assertEqual(names.preview(self.root, self.project, "完成"), before)

    def test_unsafe_names_are_rejected(self):
        for name in ("../escape", "CON.mp4", "wrong.mov", "bad|name", "name."):
            with self.subTest(name=name), self.assertRaises(names.NameError):
                names.normalize(name)

    def test_committed_file_recovers_after_process_interruption(self):
        job_id = "e" * 32
        content = b"verified MP4 bytes"
        plan = names.plan(self.root, self.project, "復旧", "version", None)
        temp = self.root / "files" / "pending.part.mp4"
        temp.write_bytes(content)
        names.finalize(self.root, self.project, plan, job_id, temp,
                       self.root / "files" / f"{job_id}.mp4")
        job = {"id": job_id, "project_id": self.project, "status": "running",
               "download_name": "復旧.mp4", "pending_output": {
                   "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest(),
                   "probe": {"frames": 1, "video_codec": "h264", "audio_codec": "aac"}}}
        (self.root / "jobs" / f"{job_id}.json").write_text(json.dumps(job), encoding="utf-8")
        recovered = render.status(self.root, job_id)
        self.assertEqual(recovered["status"], "succeeded")
        self.assertEqual(recovered["sha256"], hashlib.sha256(content).hexdigest())
        self.assertEqual(render.output_file(self.root, job_id).read_bytes(), content)
        self.assertNotIn("pending_output", recovered)


if __name__ == "__main__":
    unittest.main()
