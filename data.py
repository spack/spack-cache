import click
import requests
import time
import requests
import json
from functools import lru_cache
from pathlib import Path


BUCKET_URL = "https://binaries.spack.io/"
INDEX_URL = f"{BUCKET_URL}cache_spack_io_index.json"
DATA_DIR = Path(__file__).parent / '_data'
PACKAGE_DATA_PATH = DATA_DIR / 'package_data.json'
SPECS_DATA_PATH = DATA_DIR / 'specs_data.json'



def get_s3_response(url: str) -> dict:
    url = url.replace('s3://spack-binaries', BUCKET_URL)
    r = requests.get(url)
    r.raise_for_status()
    return r.json()


@lru_cache
def get_build_cache_index() -> dict[str, list[dict]]:
    return get_s3_response(INDEX_URL)


def save_data(data, path):
    path.parent.mkdir(exist_ok=True)
    with open(path, 'w') as f:
        json.dump(data, f, indent=4)


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

    all_packages = []
    all_specs = {}
    for tag_name, stack_info in get_build_cache_index().items():
        if len(include_tags) > 0 and tag_name not in include_tags:
            continue

        print(f'Tag: {tag_name}')
        if tag_name not in all_specs:
            all_specs[tag_name] = {}
        tag_packages = {}
        for s in stack_info:
            stack_name = s.get('label', None)
            url = s.get('url', None)

            if len(include_stacks) > 0 and stack_name not in include_stacks:
                continue

            print(f'  - Stack: {stack_name}')
            response = get_s3_response(url)
            version = response['database']['version']
            installs = response['database']['installs']

            for install in installs.values():
                spec = install['spec']
                package_name = spec['name']

                if len(include_packages) > 0 and package_name not in include_packages:
                    continue

                if package_name not in all_specs[tag_name]:
                    all_specs[tag_name][package_name] = []

                if package_name not in tag_packages:
                    print(f'    - Package: {package_name}')
                    tag_packages[package_name] = dict(
                        uid=package_name,
                        tag=tag_name,
                        url=f'https://packages.spack.io/package.html?name={package_name}',
                        rel=f'package/{tag_name}/{package_name}/specs/',
                        versions=set(),
                        compilers=set(),
                        oss=set(),
                        platforms=set(),
                        targets=set(),
                        stacks=set(),
                        num_specs=0,
                        num_specs_by_stack={},
                    )
                tag_packages[package_name]['versions'].add(spec['version'])
                compilers = set(
                    dep['name'] for dep in spec.get('dependencies', [])
                    if 'build' in dep.get('parameters', {}).get('deptypes', [])
                )
                tag_packages[package_name]['compilers'].union(compilers)
                arch = spec['arch']
                tag_packages[package_name]['oss'].add(arch['platform_os'])
                tag_packages[package_name]['platforms'].add(arch['platform'])
                target = arch['target']
                if isinstance(target, dict):
                    target = target['name']
                tag_packages[package_name]['targets'].add(target)
                tag_packages[package_name]['stacks'].add(stack_name)
                tag_packages[package_name]['num_specs'] += 1
                if stack_name not in tag_packages[package_name]['num_specs_by_stack']:
                    tag_packages[package_name]['num_specs_by_stack'][stack_name] = 0
                tag_packages[package_name]['num_specs_by_stack'][stack_name] += 1

                all_specs[tag_name][package_name].append(dict(
                    hash=spec['hash'],
                    stack=stack_name,
                    versions=[spec['version']],
                    variants=[],  # TODO: where do variants come from?
                    platform=arch['platform'],
                    os=arch['platform_os'],
                    target=target,
                    compiler=list(compilers)[0] if len(compilers) else '' # TODO: select single compiler for spec?
                ))

        all_packages += [
            {k: list(v) if isinstance(v, set) else v for k, v in package.items()}
            for package in tag_packages.values()
        ]

    save_data(all_packages, PACKAGE_DATA_PATH)
    save_data(all_specs, SPECS_DATA_PATH)

    end = time.perf_counter()
    print(f'Data retrieval completed in {end - start:.2f} seconds.')


if __name__ == '__main__':
    get_data()
