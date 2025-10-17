@echo off
title 🚀 Quick Push + Deploy for Zora Roulette
echo ===========================================
echo     ZORA ROULETTE — FAST DEPLOY SCRIPT
echo ===========================================

cd /d "%~dp0"

:: 1. Add all changes
git add .
if %errorlevel% neq 0 (
  echo ❌ Git add failed.
  pause
  exit /b
)

:: 2. Commit with auto message
set /p msg="Commit message (press Enter for default): "
if "%msg%"=="" set msg=🌀 auto commit: roulette update

git commit -m "%msg%"
if %errorlevel% neq 0 (
  echo ❌ Commit failed.
  pause
  exit /b
)

:: 3. Push to main
echo 📤 Pushing to GitHub...
git push origin main
if %errorlevel% neq 0 (
  echo ❌ Push failed.
  pause
  exit /b
)

:: 4. Optional — Trigger Vercel redeploy (if CLI installed)
vercel --prod --yes
if %errorlevel%==0 (
  echo ✅ Deployment triggered!
) else (
  echo ℹ️ If Vercel CLI not installed, it will deploy automatically via GitHub.
)

echo ===========================================
echo ✅ DONE — Check your Vercel dashboard now.
pause
