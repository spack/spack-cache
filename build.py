from utils import load_data
from jinja2 import Template, Environment, FileSystemLoader
from pathlib import Path
import shutil
import itertools
import time


TEMPLATE_DIR = Path(__file__).parent / 'templates'
TEMPLATE_STATIC_DIR = TEMPLATE_DIR / 'static'
BUILD_DIR = Path(__file__).parent / '_build'
BUILD_STATIC_DIR = BUILD_DIR / 'static'


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


def get_pages():
    tags = load_data()
    package_titles = []
    for tag in tags:
        for package in tag['packages']:
            package_titles.append(package['title'])

    return [
        dict(
            template='index.html',
            path='/',
            context=dict(
                layout='home',
                tags=tags,
                package_titles=package_titles,
            ),
        ),
        dict(
            template='404.html',
            path='/redirect',
            context=dict(
                layout='redirect',
            )
        )
    ]


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
        save_rendered(rendered, page['template'])

    copy_static()

    end = time.perf_counter()
    print(f'Build completed in {end - start:.2f} seconds.')

if __name__ == '__main__':
    build()
