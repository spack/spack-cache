# Spack Build Cache

TODO: add link here

This small interface provides a summary table that shows versions, compilers, total specs, and allows for basic search!

TODO: add screenshot here

When you dig into a particular build cache package, you'll be presented with another view to inspect specs in detail, or search.

TODO: add screenshot here

## Get Data

This Python script will parse data from (https://binaries.spack.io/)[https://binaries.spack.io/].

Recommended: Run with `uv`

```
uv run data.py
```

Alternative: Install with `pip` and run with `python`

```
pip install .
python data.py
```

### Arguments

By default, the data script will parse data for all build tags and all packages. To reduce data size, you may pass in optional arguments to filter by tag name and/or package name.

| Shorthand | Longhand  | Description                                               |
| --------- | --------- | --------------------------------------------------------- |
| -p        | --package | Package name to include. Can be specified multiple times. |
| -t        | --tag     | Build tag to include. Can be specified multiple times.    |
