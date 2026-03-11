from utils import load_data, DATA_PATH
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


def copy_data():
    BUILD_DATA_DIR.mkdir(exist_ok=True, parents=True)
    shutil.copy(DATA_PATH, BUILD_DATA_DIR / 'data.json')


def get_pages():
    packages = load_data()
    tag_names = [p['tag'] for p in packages]
    stack_names = list(set(itertools.chain.from_iterable([p['stacks'] for p in packages])))

    base_context = dict(
        base_path=os.environ.get('BASE_PATH', ''),
        tag_names=tag_names,
        stack_names=stack_names,
    )

    pages = [
        dict(
            template='index.html',
            path='',
            context=base_context,
        ),
    ]
    for tag_name in tag_names:
        pages.append(dict(
            template='table.html',
            path=f"tag/{tag_name}",
            context=base_context | dict(tag_name=tag_name),
        ))
    return pages


def build():
    start = time.perf_counter()

    # Clear previous build
    if BUILD_DIR.exists():
        shutil.rmtree(BUILD_DIR)

    env = Environment(loader=FileSystemLoader(TEMPLATE_DIR))
    pages = get_pages()
    for page in pages:
        template = env.get_template(page['template'])
        rendered = template.render(**page['context'])
        path = BUILD_DIR / page['path'] / 'index.html'
        path.parent.mkdir(exist_ok=True, parents=True)
        save_rendered(rendered, path)

    copy_static()
    copy_data()

    end = time.perf_counter()
    print(f'Build completed in {end - start:.2f} seconds.')

if __name__ == '__main__':
    build()
