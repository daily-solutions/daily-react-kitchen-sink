import os
import time
import urllib.parse
import requests
from dotenv import load_dotenv

load_dotenv()

daily_api_path = os.getenv("DAILY_API_URL") or "api.daily.co/v1"
daily_api_key = os.getenv("DAILY_API_KEY")


def create_room():
    room_props = {
        "exp": time.time() + 60 * 60,
        "enable_chat": True,
        "enable_emoji_reactions": True,
        "eject_at_room_exp": True,
        "enable_prejoin_ui": False,
    }
    res = requests.post(
        f"https://{daily_api_path}/rooms",
        headers={"Authorization": f"Bearer {daily_api_key}"},
        json={"properties": room_props},
    )
    if res.status_code != 200:
        raise Exception(f"Unable to create room: {res.text}")

    data = res.json()
    return data.get("url"), data.get("name")


def get_name_from_url(room_url):
    return urllib.parse.urlparse(room_url).path[1:]


def get_token(room_url):
    if not room_url:
        raise Exception("No Daily room specified.")
    if not daily_api_key:
        raise Exception("No Daily API key specified.")

    expiration = time.time() + 60 * 60
    room_name = get_name_from_url(room_url)

    res = requests.post(
        f"https://{daily_api_path}/meeting-tokens",
        headers={"Authorization": f"Bearer {daily_api_key}"},
        json={"properties": {"room_name": room_name, "is_owner": True, "exp": expiration}},
    )
    if res.status_code != 200:
        raise Exception(f"Failed to create meeting token: {res.status_code} {res.text}")

    return res.json()["token"]
