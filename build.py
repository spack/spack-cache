from utils import load_data
from jinja2 import Template
from pathlib import Path


TEMPLATE_DIR = Path(__file__).parent / 'templates'
BUILD_DIR = Path(__file__).parent / '_build'


def load_template(template_name):
    template_path = TEMPLATE_DIR / template_name
    with open(template_path, 'r') as f:
        return Template(f.read())

def save_rendered(rendered, output_name):
    BUILD_DIR.mkdir(exist_ok=True)
    output_path = BUILD_DIR / output_name
    with open(output_path, 'w') as f:
        f.write(rendered)

def build():
    tags = load_data()
    template = load_template('test.html')
    rendered = template.render(tags=tags)
    save_rendered(rendered, 'test.html')

if __name__ == '__main__':
    build()
