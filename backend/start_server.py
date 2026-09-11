#!/usr/bin/env python3
"""Startup wrapper for Render deployment - ensures proper Python path."""
import sys
import os

# Add the current directory (backend) to Python path so 'database' module is found
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Debug: print what we're doing
print(f"Python path: {sys.path}", flush=True)
print(f"Backend dir: {backend_dir}", flush=True)

# Now import and run the server
import uvicorn

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting server on port {port}", flush=True)
    uvicorn.run("server:app", host="0.0.0.0", port=port, log_level="info")
