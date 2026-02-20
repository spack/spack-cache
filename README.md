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

## Build Web Pages

After obtaining data via the data script, you can build static web pages with the build script. The build script loads the data into a set of HTML templates and saves the populated pages to the build directory.

Recommended: Run with `uv`

```
uv run build.py
```

Alternative: Install with `pip` and run with `python`

```
pip install -e .
python build.py
```

## Serve Web Pages

After building the static web pages with the build script, you can serve them locally with the builtin python package `http.server`.

Recommended: Run with `uv`

```
uv run python -m http.server 8000 -d _build
```

Alternative: Run with `python`

```
python -m http.server 8000 -d _build
```

**Note:** You may chose to replace `8000` with any other available port number.
