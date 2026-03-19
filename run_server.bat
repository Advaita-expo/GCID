@echo off
cd /d "%~dp0"
REM ensure we are in project root
cd /d "C:\Users\shlok\OneDrive\Desktop\pragya project 5"
set PORT=5000
"C:\Users\shlok\OneDrive\Desktop\pragya project 5\venv\Scripts\python.exe" "C:\Users\shlok\OneDrive\Desktop\pragya project 5\gcid\app.py"
pause
