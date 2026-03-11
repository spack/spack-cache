import requests
import json
from functools import lru_cache
from pathlib import Path

BUCKET_URL = "https://binaries.spack.io/"
INDEX_URL = f"{BUCKET_URL}cache_spack_io_index.json"
DATA_PATH = Path(__file__).parent / '_data' / 'cache.json'


def get_s3_response(url: str) -> dict:
    url = url.replace('s3://spack-binaries', BUCKET_URL)
    r = requests.get(url)
    r.raise_for_status()
    return r.json()


@lru_cache
def get_build_cache_index() -> dict[str, list[dict]]:
    return get_s3_response(INDEX_URL)


def save_data(data):
    DATA_PATH.parent.mkdir(exist_ok=True)
    with open(DATA_PATH, 'w') as f:
        json.dump(data, f, indent=4)


def load_data():
    if not DATA_PATH.exists():
        return []
    with open(DATA_PATH, 'r') as f:
        return json.load(f)
