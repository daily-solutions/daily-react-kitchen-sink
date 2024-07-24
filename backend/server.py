import os
import argparse
import subprocess
import atexit
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from utils.daily_helpers import create_room as _create_room, get_token, get_name_from_url
from dotenv import load_dotenv
import uvicorn

MAX_BOTS_PER_ROOM = 1
bot_procs = {}

load_dotenv()


def cleanup():
    for proc in bot_procs.values():
        proc.terminate()
        proc.wait()


atexit.register(cleanup)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_DIR = "../frontend/public"
app.mount("/static", StaticFiles(directory=STATIC_DIR, html=True), name="static")


@app.post("/start")
async def start_agent(request: Request) -> JSONResponse:
    data = await request.json()
    room_url = data.get('room_url')
    if not room_url:
        raise HTTPException(
            status_code=500,
            detail="Missing 'room' property in request data. Cannot start agent without a target room!")
    token = get_token(room_url)
    if not token:
        raise HTTPException(status_code=500, detail=f"Failed to get token for room: {room_url}")

    try:
        proc = subprocess.Popen(
            [
                f"python3 -m bot -u {room_url} -t {token}"
            ],
            shell=True,
            bufsize=1,
            cwd=os.path.dirname(os.path.abspath(__file__))
        )
        bot_procs[proc.pid] = (proc, room_url)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start subprocess: {e}")

    return JSONResponse({"bot_id": proc.pid, "room_url": room_url})

if __name__ == "__main__":
    required_env_vars = ['OPENAI_API_KEY', 'DAILY_API_KEY', 'ELEVENLABS_API_KEY']
    for env_var in required_env_vars:
        if env_var not in os.environ:
            raise Exception(f"Missing environment variable: {env_var}.")

    default_host = os.getenv("HOST", "0.0.0.0")
    default_port = int(os.getenv("FAST_API_PORT", "8000"))

    parser = argparse.ArgumentParser(description="Daily Storyteller FastAPI server")
    parser.add_argument("--host", type=str, default=default_host, help="Host address")
    parser.add_argument("--port", type=int, default=default_port, help="Port number")
    parser.add_argument("--reload", action="store_true", help="Reload code on change")

    config = parser.parse_args()

    uvicorn.run("server:app", host=config.host, port=config.port, reload=config.reload)
