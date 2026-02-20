from dataclasses import dataclass


@dataclass(frozen=True)
class PackageSpec:
    compiler: str
    hash: str
    os: str
    platform: str
    size: str
    stacks: list[str]
    target: str
    variants: list[str]
    versions: list[str]
    tarball: str


@dataclass(frozen=True)
class Package:
    title: str
    categories: list[str]
    specs: list[PackageSpec]

    def get_metadata(self) -> dict:
        # get unique values for compilers, oss, platforms, stacks, and versions across all specs
        compilers = list(set([spec.compiler for spec in self.specs]))
        oss = list(set([spec.os for spec in self.specs]))
        platforms = list(set([spec.platform for spec in self.specs]))
        targets = list(set([spec.target for spec in self.specs]))
        # flatten nested lists of stacks and versions, then get unique values
        stacks = list(set(itertools.chain.from_iterable([spec.stacks for spec in self.specs])))
        versions = list(set(itertools.chain.from_iterable([spec.versions for spec in self.specs])))
        num_specs_by_stack = {stack: len([spec for spec in self.specs if stack in spec.stacks]) for stack in stacks}
        return dict(
            num_specs=len(self.specs),
            num_specs_by_stack=num_specs_by_stack,
            compilers=compilers,
            oss=oss,
            platforms=platforms,
            stacks=stacks,
            targets=targets,
            versions=versions,
        )
