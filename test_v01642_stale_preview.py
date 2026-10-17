from pathlib import Path

SRC = (Path(__file__).parent / 'v01633_35_scrub.js').read_text(encoding='utf-8')

def test_old_response_is_discarded():
    assert 'epoch!==requestEpoch||file.files?.[0]!==selectedFile' in SRC
    assert 'requestEpoch=0' in SRC

def test_source_target_change_invalidates_preview():
    assert "getElementById('sk-source')?.addEventListener('change'" in SRC
    assert "getElementById('sk-target')?.addEventListener('change'" in SRC

def test_saving_requires_explicit_confirmation():
    assert 'if(!report||!confirmInput.checked)return;' in SRC

def test_user_unchecking_invalidates():
    assert 'confirmInput.onchange=' in SRC
    assert 'invalidate();cleanup();' in SRC
