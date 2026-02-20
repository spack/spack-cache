import click
import requests
import time

from utils import get_build_cache_index, get_s3_response, save_data
from classes import PackageSpec, Package, Tag


@click.option(
    '--tag',
    '-t',
    multiple=True,
    help='Build cache version tag to include. Can be specified multiple times.'
)
@click.option(
    '--package',
    '-p',
    multiple=True,
    help='Package name to include. Can be specified multiple times.'
)
@click.command()
def get_data(tag, package):
    start = time.perf_counter()
    include_tags = list(tag)
    include_packages = list(package)

    tags = []
    for tag_name, package_info in get_build_cache_index().items():
        if len(include_tags) > 0 and tag_name not in include_tags:
            continue

        packages = []
        print(f'Tag: {tag_name}')
        for p in package_info:
            label = p.get('label', None)
            url = p.get('url', None)

            if len(include_packages) > 0 and label not in include_packages:
                continue

            print(f'  - Package: {label}')
            response = get_s3_response(url)
            version = response['database']['version']
            installs = response['database']['installs']

            # Create a list of PackageSpec objects from the installs
            specs = []
            for install in installs.values():
                spec = install['spec']
                arch = spec['arch']
                target = arch['target']
                if isinstance(target, dict):
                    target = target.get('name', '-')
                specs.append(PackageSpec(
                    compiler='-',
                    hash=spec['hash'],
                    os=arch['platform_os'],
                    platform=arch['platform'],
                    size='-',
                    stacks=['-'],
                    target=target,
                    variants=['-'],
                    versions=[spec['version']],
                    tarball='-'
                ))

            # Create a package object and add it to the packages for this tag
            packages.append(Package(
                title=label,
                categories=['-'],
                specs=specs
            ))
        tags.append(Tag(
            title=tag_name,
            packages=packages
        ))
    save_data(tags)

    end = time.perf_counter()
    print(f'Data retrieval completed in {end - start:.2f} seconds.')


if __name__ == '__main__':
    get_data()
