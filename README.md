# Spack Build Cache

TODO: add link here

This small interface provides a summary table that shows versions, compilers, total specs, and allows for basic search!

TODO: add screenshot here

When you dig into a particular build cache package, you'll be presented with another view to inspect specs in detail, or search.

TODO: add screenshot here

# Usage

> **Note:** This usage guide recommends running these scripts via [uv](https://docs.astral.sh/uv/), so most commands are prefixed with `uv run`. You may also elect to run these scripts with native python instead, but you will need to run `pip install -e .` first.

## Get Data

This Python script will parse data from (https://binaries.spack.io/)[https://binaries.spack.io/].

```
uv run data.py
```

By default, the data script will parse data for all build tags and all packages. To reduce data size, you may pass in optional arguments to filter by tag name and/or package name.

| Shorthand | Longhand  | Description                                               |
| --------- | --------- | --------------------------------------------------------- |
| -t        | --tag     | Build tag to include. Can be specified multiple times.    |
| -s        | --stack   | Stack name to include. Can be specified multiple times.   |
| -p        | --package | Package name to include. Can be specified multiple times. |

## Build Web Pages

After obtaining data via the data script, you can build static web pages with the build script. The build script leverages [Jinja2](https://jinja.palletsprojects.com/en/stable/) to load the data into a set of HTML templates and saves the populated pages to the build directory.

```
uv run build.py
```

## Serve Static Web Pages

After building the static web pages with the build script, you can serve them locally with the serve static script, which leverages the builtin python package `http.server`.

```
uv run serve_static.py --port 8000
```

> **Note:** You may chose to replace 8000 with any other available port number.

## Development Mode

### Run the local development server

When developing templates, it can be burdensome to rebuild after every change. Instead, you may launch a local development server that will reload after every change to the template files. This local development server leverages [Uvicorn](https://uvicorn.dev/) and [FastAPI](https://fastapi.tiangolo.com/). Visit `localhost:8000` in your browser to view the local development server.

```
uv run serve_dev.py
```

> **Note:** Ensure that your browser has disabled caching of static files.

### Run a proxy for refreshing the browser

This step is optional. If you choose not to do this step, you will need to refresh the page in your browser whenever the local development server reloads.

In a separate terminal, run the proxy command. The command below will leverage [Browsersync](https://browsersync.io/) to run a proxy server on port 8080 that will automatically refresh the browser when changes are made. Visit `localhost:8080` in your browser and start making changes to templates.

```
cd sync
npm i
npm run sync
```
