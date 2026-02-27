@echo off
echo Iniciando Backend...
start "Backend" cmd /k "cd /d E:\zed_projects\geral\Coinglass && uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload"

echo Iniciando Frontend...
start "Frontend" cmd /k "cd /d E:\zed_projects\geral\Coinglass\frontend && npm run dev"

echo.
echo Servidores iniciados!
echo Backend: http://localhost:8000
echo Frontend: http://localhost:5173
pause
