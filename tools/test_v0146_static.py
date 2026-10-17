from pathlib import Path
p=Path(__file__).resolve().parents[1]/'index.html'
s=p.read_text(encoding='utf-8')
for token in ('iv-seek','iv-camera-mode','iv-camera-reset','ivSetTime','ivInstallCameraEvents','ivViewCameras','ivViewTargets','ivCameraMode'):
    assert token in s, token
assert 'ivRenderer.setScissor(left,0,sw,h)' in s
assert 'cam=shots===1?ivCam:ivViewCameras[i]' in s
print('v0.14.6 static checks: PASS')
