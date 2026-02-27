import subprocess
import sys
import os
import time
import threading

def stream_output(process, name):
    """Stream process output to console"""
    for line in iter(process.stdout.readline, ''):
        if line:
            print(f"[{name}] {line}", end='')

def main():
    project_root = os.path.dirname(os.path.abspath(__file__))
    
    print("=" * 50)
    print("Iniciando Backend e Frontend...")
    print("=" * 50)
    
    # Iniciar backend
    print("\n🚀 Iniciando Backend (http://localhost:8000)...")
    backend_process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"],
        cwd=project_root,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    
    # Start thread to stream backend output
    backend_thread = threading.Thread(target=stream_output, args=(backend_process, "BACKEND"), daemon=True)
    backend_thread.start()
    
    # Iniciar frontend - usando cmd.exe no Windows
    print("\n🎨 Iniciando Frontend (http://localhost:5173)...")
    frontend_process = subprocess.Popen(
        "cmd /c npm run dev",
        cwd=os.path.join(project_root, "frontend"),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        shell=True,
        bufsize=1
    )
    
    # Start thread to stream frontend output
    frontend_thread = threading.Thread(target=stream_output, args=(frontend_process, "FRONTEND"), daemon=True)
    frontend_thread.start()
    
    print("\n✅ Servidores iniciados!")
    print("   Backend: http://localhost:8000")
    print("   Frontend: http://localhost:5173")
    print("\nPressione Ctrl+C para encerrar...")
    
    try:
        # Mantém os processos rodando
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n\n🛑 Encerrando servidores...")
        backend_process.terminate()
        frontend_process.terminate()
        print("✅ Servidores encerrados!")

if __name__ == "__main__":
    main()
