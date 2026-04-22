import click
import requests
import time
import json
from json import JSONEncoder
from pathlib import Path
from functools import lru_cache


BASE_URL = 'https://binaries.spack.io/'
MANIFEST_URL = BASE_URL + 'cache_spack_io_index.json'
DATA_DIR = Path(__file__).parent / '_data'
PACKAGE_DATA_PATH = DATA_DIR / 'package_data.json'
SPECS_DATA_PATH = DATA_DIR / 'specs_data.json'
TREE_DATA_PATH = DATA_DIR / 'tree_data.json'


class SetEncoder(JSONEncoder):
    def default(self, obj):
        return list(obj)


def get_response(url):
    response = requests.get(url)
    response.raise_for_status()
    return response.json()


def save_data(data, path):
    path.parent.mkdir(exist_ok=True, parents=True)
    with open(path, 'w') as f:
        json.dump(data, f, indent=4, cls=SetEncoder)


@lru_cache
def load_data(path):
    if not path.exists():
        return []
    with open(path, 'r') as f:
        return json.load(f)


@click.option(
    '--tag',
    '-t',
    multiple=True,
    help='Build cache version tag to include. Can be specified multiple times.'
)
@click.option(
    '--stack',
    '-s',
    multiple=True,
    help='Stack name to include. Can be specified multiple times.'
)
@click.option(
    '--package',
    '-p',
    multiple=True,
    help='Package name to include. Can be specified multiple times.'
)
@click.command()
def get_data(tag, stack, package):
    start = time.perf_counter()
    include_tags = list(tag)
    include_stacks = list(stack)
    include_packages = list(package)

    packages = {}
    specs = {}
    tree = set()
    for tag_name, stack_info in get_response(MANIFEST_URL).items():
        if len(include_tags) > 0 and tag_name not in include_tags:
            continue

        print(f'Tag: {tag_name}')
        for s in stack_info:
            stack_name = s['label']
            if len(include_stacks) > 0 and stack_name not in include_stacks:
                continue

            print(f'  - Stack: {stack_name}')
            url = s['url'].replace('s3://spack-binaries/', BASE_URL)
            response = get_response(url)
            installs = response['database']['installs']
            for install in installs.values():
                spec = install['spec']
                package_name = spec['name']
                if len(include_packages) > 0 and package_name not in include_packages:
                    continue

                if package_name not in packages:
                    print(f'    - Package: {package_name}')
                    packages[package_name] = dict(
                        uid=package_name,
                        url=f'https://packages.spack.io/package.html?name={package_name}',
                        specs=set(),
                    )
                tree.add(json.dumps(dict(
                    name=package_name,
                    tag=tag_name,
                    stack=stack_name,
                )))

                spec_hash = spec['hash']
                packages[package_name]['specs'].add(spec_hash)
                if spec_hash not in specs:
                    arch = spec['arch']
                    target = arch['target']
                    if isinstance(target, dict):
                        target = target['name']
                    variants = []
                    for key, value in spec['parameters'].items():
                        if isinstance(value, bool):
                            if value:
                                variants.append(f'+{key}')
                            else:
                                variants.append(f'~{key}')
                        elif isinstance(value, list):
                            for v in value:
                                variants.append(f'{key}={v}')
                        else:
                            variants.append(f'{key}={value}')
                    dependencies = []
                    for dep in spec.get('dependencies', []):
                        dep_string = ''
                        link = None
                        # only include dependencies where 'link' or 'run' in deptypes
                        deptypes = dep['parameters']['deptypes']
                        if not ('link' in deptypes or 'run' in deptypes):
                            continue
                        virtuals = dep['parameters']['virtuals']
                        if len(virtuals):
                            dep_string += f'%{",".join(virtuals)}='
                        dep_string += dep['name']
                        if dep['hash'] in installs:
                            version = installs[dep['hash']]['spec']['version']
                            dep_string += f'@{version}'
                            link = '/package/' + dep['name']
                        dependencies.append(dict(
                            label=dep_string,
                            link=link,
                        ))
                    specs[spec_hash] = dict(
                        hash=spec_hash,
                        version=spec['version'],
                        variants=variants,
                        platform=arch['platform'],
                        os=arch['platform_os'],
                        target=target,
                        dependencies=dependencies,
                        stacks=set(),
                        tags=set(),
                    )
                specs[spec_hash]['tags'].add(tag_name)
                specs[spec_hash]['stacks'].add(stack_name)

    save_data(packages, PACKAGE_DATA_PATH)
    save_data(specs, SPECS_DATA_PATH)

    # Convert tree data from set of strings to list of dicts
    tree = [json.loads(item) for item in tree]
    save_data(tree, TREE_DATA_PATH)

    end = time.perf_counter()
    print(f'Data retrieval completed in {end - start:.2f} seconds.')


if __name__ == '__main__':
    get_data()
