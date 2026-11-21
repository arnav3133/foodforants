@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>&1
if not errorlevel 1 goto use_py
where python | findstr /i "WindowsApps" >nul
if not errorlevel 1 goto missing_python
where python >nul 2>&1
if errorlevel 1 goto missing_python
start "Natural Decay local server" cmd /k python -m http.server 8000 --bind 127.0.0.1
goto open_page
:use_py
start "Natural Decay local server" cmd /k py -m http.server 8000 --bind 127.0.0.1
:open_page
timeout /t 2 /nobreak >nul
start "Natural Decay" "http://127.0.0.1:8000"
goto end
:missing_python
echo Python was not found. Install Python from python.org, then double-click this file again.
echo Or open this folder in VS Code and use the Live Server extension.
pause
:end
