@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul
if not errorlevel 1 (
  set "PYCMD=py -3"
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python 3 is required: https://www.python.org/downloads/
    pause
    exit /b 1
  )
  set "PYCMD=python"
)
start "" "http://127.0.0.1:8765/"
%PYCMD% server.py 8765
pause
