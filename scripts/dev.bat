@echo off
setlocal

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Install Node.js 22.5 or newer, then run this again.
  pause
  exit /b 1
)

node "%~dp0dev-windows.mjs"
if errorlevel 1 (pause) else ("%SystemRoot%\System32\timeout.exe" /t 20)
