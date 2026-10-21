import click
import requests
import time
import json
import os
import shutil
from json import JSONEncoder
from pathlib import Path
from functools import lru_cache


BASE_URL = 'https://binaries.spack.io/'
MANIFEST_URL = BASE_URL + 'cache_spack_io_index.json'
DATA_DIR = Path(__file__).parent / '_data'
INDEX_DATA_PATH = DATA_DIR / 'index.json'
FILTERS_DATA_PATH = DATA_DIR / 'filters.json'
PACKAGES_DATA_DIR = DATA_DIR / 'packages'
IGNORE_STACKS = ['root']
DEPTYPES = ['build', 'link', 'run', 'test']
MIN_SHORT_HASH_LENGTH = 7


class SetEncoder(JSONEncoder):
    def default(self, obj):
        return list(obj)


def get_response(url):
    response = requests.get(url)
    response.raise_for_status()
    return response.json()


def save_data(data, path):
    # Files are small and served with transparent (transport) compression, so
    # write compact, uncompressed JSON.
    path.parent.mkdir(exist_ok=True, parents=True)
    with open(path, 'w', encoding='UTF-8') as f:
        json.dump(data, f, separators=(',', ':'), cls=SetEncoder)


def short_hash_length(hashes):
    # Shortest prefix length that keeps every hash unique
    hashes = sorted(hashes)
    longest_common = max(
        (len(os.path.commonprefix([a, b])) for a, b in zip(hashes, hashes[1:])),
        default=0,
    )
    return max(MIN_SHORT_HASH_LENGTH, longest_common + 1)


def dependency_closure(spec_hashes, specs):
    closure = set()
    stack = list(spec_hashes)
    while stack:
        spec_hash = stack.pop()
        if spec_hash in closure or spec_hash not in specs:
            continue
        closure.add(spec_hash)
        stack.extend(dep['hash'] for dep in specs[spec_hash]['dependencies'])
    return closure


def package_data(package_spec_hashes, specs, names, hash_length):
    """
    Data for a single package page: its specs (table rows) and a node table
    with the transitive dependencies of those specs (dependency tree dialog).

    Nodes are [short_hash, name, version, [dep_index, deptype_bits, ...]],
    where deptype bit i corresponds to DEPTYPES[i].
    """
    node_hashes = sorted(dependency_closure(package_spec_hashes, specs))
    node_index = {spec_hash: i for i, spec_hash in enumerate(node_hashes)}
    nodes = []
    for spec_hash in node_hashes:
        spec = specs[spec_hash]
        edges = []
        for dep in spec['dependencies']:
            if dep['hash'] not in node_index:
                continue
            deptypes = dep.get('parameters', {}).get('deptypes', [])
            edges.append(node_index[dep['hash']])
            edges.append(sum(1 << DEPTYPES.index(t) for t in deptypes if t in DEPTYPES))
        nodes.append([spec_hash[:hash_length], names[spec_hash], spec['version'], edges])

    rows = []
    for spec_hash in package_spec_hashes:
        spec = specs[spec_hash]
        rows.append(dict(
            hash=spec_hash,
            version=spec['version'],
            variants=spec['variants'],
            platform=spec['platform'],
            os=spec['os'],
            target=spec['target'],
            stacks=sorted(spec['stacks']),
            releases=sorted(spec['releases']),
            node=node_index[spec_hash],
        ))
    return dict(specs=rows, nodes=nodes)


def save_api_data(packages, specs):
    """
    Split the data into files so that each page only loads what it shows:

    - index.json: spec counts per package and release (sidebar, home page)
    - packages/<name>.json: table rows and dependency nodes for one package
    - filters.json: attribute value -> package -> spec indices (sidebar filters)
    """
    if DATA_DIR.exists():
        shutil.rmtree(DATA_DIR)

    names = {}
    package_spec_hashes = {}
    for package_name, package in packages.items():
        # Keep release order (from the manifest) for the table rows
        hashes = list(dict.fromkeys(h for release_hashes in package['specs'].values() for h in release_hashes))
        package_spec_hashes[package_name] = hashes
        for spec_hash in hashes:
            names[spec_hash] = package_name

    index = dict(
        builds=len(specs),
        packages={
            package_name: dict(
                count=len(package_spec_hashes[package_name]),
                releases={r: len(hashes) for r, hashes in sorted(package['specs'].items())},
            )
            for package_name, package in sorted(packages.items())
        },
    )
    save_data(index, INDEX_DATA_PATH)

    hash_length = short_hash_length(specs)
    filter_keys = dict(
        version='version',
        variant='variants',
        platform='platform',
        os='os',
        target='target',
        stack='stacks',
        release='releases',
    )
    filters = {key: {} for key in filter_keys}
    for package_name, hashes in package_spec_hashes.items():
        data = package_data(hashes, specs, names, hash_length)
        save_data(data, PACKAGES_DATA_DIR / f'{package_name}.json')
        for i, row in enumerate(data['specs']):
            for key, column in filter_keys.items():
                values = row[column] if isinstance(row[column], list) else [row[column]]
                for value in values:
                    filters[key].setdefault(value, {}).setdefault(package_name, []).append(i)
    save_data(filters, FILTERS_DATA_PATH)


@lru_cache
def load_data(path):
    if not path.exists():
        return []
    with open(path, 'r') as f:
        return json.load(f)


@click.option(
    '--release',
    '-t',
    multiple=True,
    help='Build cache release to include. Can be specified multiple times.'
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
def get_data(release, stack, package):
    start = time.perf_counter()
    include_releases = list(release)
    include_stacks = list(stack)
    include_packages = list(package)

    packages = {}
    specs = {}
    for release_name, stack_info in get_response(MANIFEST_URL).items():
        if len(include_releases) > 0 and release_name not in include_releases:
            continue

        print(f'Release: {release_name}')
        for s in stack_info:
            stack_name = s['label']
            if (
                stack_name in IGNORE_STACKS or 
                (len(include_stacks) > 0 and stack_name not in include_stacks)
            ):
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
                        releases=set(),
                        specs={},
                    )
                packages[package_name]['releases'].add(release_name)
                if release_name not in packages[package_name]['specs']:
                    packages[package_name]['specs'][release_name] = set()

                spec_hash = spec['hash']
                packages[package_name]['specs'][release_name].add(spec_hash)
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
                    specs[spec_hash] = dict(
                        hash=spec_hash,
                        version=spec['version'],
                        variants=variants,
                        platform=arch['platform'],
                        os=arch['platform_os'],
                        target=target,
                        dependencies=spec.get('dependencies', []),
                        stacks=set(),
                        releases=set(),
                    )
                specs[spec_hash]['releases'].add(release_name)
                specs[spec_hash]['stacks'].add(stack_name)

    save_api_data(packages, specs)

    end = time.perf_counter()
    print(f'Data retrieval completed in {end - start:.2f} seconds.')


if __name__ == '__main__':
    get_data()
