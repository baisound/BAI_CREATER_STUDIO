import ctypes
import os
import subprocess
import sys
import time

import pytest

from bai_studio.v05.render.media_render import _stop_capture


@pytest.mark.skipif(os.name != "nt", reason="Windows taskkill tree contract")
def test_capture_stop_reaps_descendant(tmp_path):
    """A forced capture stop must not leave its browser-equivalent child alive."""
    marker = tmp_path / "child.pid"
    script = ("import subprocess,sys,time,pathlib; "
              "child=subprocess.Popen([sys.executable,'-c','import time; time.sleep(120)']); "
              "pathlib.Path(sys.argv[1]).write_text(str(child.pid)); time.sleep(120)")
    process = subprocess.Popen([sys.executable, "-c", script, str(marker)],
                               creationflags=subprocess.CREATE_NO_WINDOW)
    child_pid = None
    try:
        deadline = time.monotonic() + 10
        while not marker.exists() and time.monotonic() < deadline:
            time.sleep(0.05)
        assert marker.exists()
        child_pid = int(marker.read_text())
        _stop_capture(process)
        assert process.poll() is not None
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.OpenProcess.restype = ctypes.c_void_p
        kernel.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
        kernel.CloseHandle.argtypes = [ctypes.c_void_p]
        handle = kernel.OpenProcess(0x100000, False, child_pid)
        if handle:
            try:
                assert kernel.WaitForSingleObject(handle, 1000) == 0
            finally:
                kernel.CloseHandle(handle)
    finally:
        if process.poll() is None:
            subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                           capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
        process.wait()
