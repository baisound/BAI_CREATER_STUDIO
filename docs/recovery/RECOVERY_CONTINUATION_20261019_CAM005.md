# Phase E CAM-005: interval diagnostics normalization

Source checkpoint: e68dafc. This is NOT certified as ff5c555 equivalent.

## Change
- `camera_focus_consistency.js` `intervals` sorts failed frame indices and removes duplicates before coalescing consecutive failing frames.
- Reject malformed interval samples rather than silently reporting an unreliable result.
- Two focused regression tests cover unordered/duplicate frames and invalid samples.

## Verification
- `python -m pytest -q`: 275 passed, 5 subtests passed.
- `node --test test_camera_focus_consistency.cjs`: 5 tests passed.
- Python standard `unittest discover -p 'test_*.py'`: 132 tests passed.

## NOT verified / still blocked
- Real GPU DOF rendering, live animated model bone coordinates, video and camera VMD runtime behavior.
- General-purpose project new/save/save-as/open, external assets, CAM-015 end-to-end and MCP integration.
- Completeness and equivalence to historical ff5c555.

Do not change `release_complete` to true without full integration checks. Preserve E -> F priority and no unrequested features.
