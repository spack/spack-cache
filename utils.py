import requests
from functools import lru_cache
from pathlib import Path

BUCKET_URL = "https://binaries.spack.io/"
INDEX_URL = f"{BUCKET_URL}cache_spack_io_index.json"


def get_s3_response(url: str) -> dict:
    url = url.replace('s3://spack-binaries', BUCKET_URL)
    r = requests.get(url)
    r.raise_for_status()
    return r.json()


@lru_cache
def get_build_cache_index() -> dict[str, list[dict]]:
    return get_s3_response(INDEX_URL)
