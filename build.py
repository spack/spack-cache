from data import PACKAGE_DATA_PATH, SPECS_DATA_PATH, load_data, save_data
from jinja2 import Template, Environment, FileSystemLoader
from pathlib import Path
import shutil
import itertools
import time
import os

TEMPLATE_DIR = Path(__file__).parent / 'templates'
TEMPLATE_STATIC_DIR = TEMPLATE_DIR / 'static'
BUILD_DIR = Path(__file__).parent / '_build'
BUILD_STATIC_DIR = BUILD_DIR / 'static'
BUILD_DATA_DIR = BUILD_DIR / 'api'


def save_rendered(rendered, output_name):
    BUILD_DIR.mkdir(exist_ok=True, parents=True)
    output_path = BUILD_DIR / output_name
    with open(output_path, 'w') as f:
        f.write(rendered)

def copy_static():
    BUILD_STATIC_DIR.mkdir(exist_ok=True, parents=True)
    for item in TEMPLATE_STATIC_DIR.iterdir():
        if item.is_file():
            dest = BUILD_STATIC_DIR / item.name
            if item.name == 'favicon.ico':
                # Favicon must be in the root for browsers to find it
                dest = BUILD_DIR / item.name
            shutil.copy(item, dest)

def get_context_data():
    return dict(
        base_path=os.environ.get('BASE_PATH', ''),
        packages=load_data(PACKAGE_DATA_PATH),
        specs=load_data(SPECS_DATA_PATH),
    )

def build():
    start = time.perf_counter()

    # Clear previous build
    if BUILD_DIR.exists():
        shutil.rmtree(BUILD_DIR)

    env = Environment(loader=FileSystemLoader(TEMPLATE_DIR))
    template = env.get_template('index.html')
    save_rendered(
        template.render(**get_context_data()),
        BUILD_DIR / 'index.html',
    )
    copy_static()

    end = time.perf_counter()
    print(f'Build completed in {end - start:.2f} seconds.')

if __name__ == '__main__':
    build()
