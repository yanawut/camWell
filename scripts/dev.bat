@echo off
setlocal
set "ROOT=%~dp0.."

for %%D in (backend frontend) do (
  if not exist "%ROOT%\%%D\node_modules" (
    echo Installing %%D packages...
    pushd "%ROOT%\%%D"
    call npm.cmd install
    if errorlevel 1 (
      popd
      exit /b 1
    )
    popd
  )
)

start "camWell backend" /d "%ROOT%\backend" cmd /k "npm.cmd run dev"

if exist "%ROOT%\yolo-backend\.venv\Scripts\python.exe" (
  start "camWell yolo-backend" /d "%ROOT%" cmd /k "npm.cmd run dev:yolo"
) else (
  echo yolo-backend\.venv not found, skipping yolo-backend.
)

start "camWell frontend" /d "%ROOT%\frontend" cmd /k "npm.cmd run dev -- --open"
