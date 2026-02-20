from dataclasses import dataclass
import itertools

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

    def to_dict(self) -> dict:
        return dict(
            compiler=self.compiler,
            hash=self.hash,
            os=self.os,
            platform=self.platform,
            size=self.size,
            stacks=self.stacks,
            target=self.target,
            variants=self.variants,
            versions=self.versions,
            tarball=self.tarball
        )


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

    def to_dict(self) -> dict:
        return dict(
            title=self.title,
            categories=self.categories,
            meta=self.get_metadata(),
            specs=[spec.to_dict() for spec in self.specs]
        )

@dataclass(frozen=True)
class Tag:
    title: str
    packages: list[Package]

    def to_dict(self) -> dict:
        return dict(
            title=self.title,
            packages=[package.to_dict() for package in self.packages]
        )

    title: str
    packages: list[Package]
