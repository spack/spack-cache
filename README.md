# Spack Build Cache

TODO: add link here

This small interface provides a summary table that shows versions, compilers, total specs, and allows for basic search!

TODO: add screenshot here

When you dig into a particular build cache package, you'll be presented with another view to inspect specs in detail, or search.

TODO: add screenshot here

## Usage

This Python package will parse data from (https://binaries.spack.io/)[https://binaries.spack.io/] to generate static webpages.

Recommended: Run with `uv`

```
uv run main.py
```

Alternative: Install with `pip` and run with `python`

```
pip install .
python main.py
```

### Arguments

By default, the main script will parse data for all build tags and all packages. To reduce data size, you may pass in optional arguments to filter by tag name and/or package name.

| Shorthand | Longhand  | Description                                               |
| --------- | --------- | --------------------------------------------------------- |
| -p        | --package | Package name to include. Can be specified multiple times. |
| -t        | --tag     | Build tag to include. Can be specified multiple times.    |
