import uvicorn

from functools import lru_cache
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from build import SPECS_DATA_PATH, TEMPLATE_DIR, TEMPLATE_STATIC_DIR, get_pages, get_context_data


app = FastAPI()

# Mount the "static" directory to serve static files
app.mount(
    "/static",
    StaticFiles(directory=TEMPLATE_STATIC_DIR),
    name="static",
)

@lru_cache
def get_tree_data():
    context_data = get_context_data()
    return context_data.get('tree_data')

# Favicon must be in the root for browsers to find it
@app.get('/favicon.ico')
def get_favicon():
    favicon_path = TEMPLATE_STATIC_DIR / 'favicon.ico'
    if favicon_path.exists():
        return FileResponse(
            path=favicon_path,
            filename='favicon.ico',
        )

@app.get('/api/tree_data.json')
def get_data():
   return get_tree_data()

templates = Jinja2Templates(directory=TEMPLATE_DIR)
def serve_template(template_name, context):
    def endpoint(request: Request):
        return templates.TemplateResponse(
            template_name,
            context | dict(request=request)
        )
    return endpoint

for page in get_pages():
    app.add_api_route(
        path='/' + page.get('path'),
        endpoint=serve_template(page.get('template'), page.get('context')),
        methods=['GET'],
    )

if __name__ == '__main__':
    uvicorn.run("serve_dev:app", port=8000)
