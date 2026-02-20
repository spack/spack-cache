import click
import requests

from utils import get_build_cache_index, get_s3_response
from classes import PackageSpec, Package


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
def main(tag, package):
    include_tags = list(tag)
    include_packages = list(package)

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
                specs.append(PackageSpec(
                    compiler='-',
                    hash=spec['hash'],
                    os=arch['platform_os'],
                    platform=arch['platform'],
                    size='-',
                    stacks=['-'],
                    target=arch['target'],
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


if __name__ == '__main__':
    main()
