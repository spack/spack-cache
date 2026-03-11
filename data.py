import click
import requests
import time

from utils import get_build_cache_index, get_s3_response, save_data

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
    for tag_name, stack_info in get_build_cache_index().items():
        if len(include_tags) > 0 and tag_name not in include_tags:
            continue
        tag_packages = {}
        print(f'Tag: {tag_name}')
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
        all_packages += [
            {k: list(v) if isinstance(v, set) else v for k, v in package.items()}
            for package in tag_packages.values()
        ]
    save_data(all_packages)

    end = time.perf_counter()
    print(f'Data retrieval completed in {end - start:.2f} seconds.')


if __name__ == '__main__':
    get_data()
