import uvicorn

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from build import TEMPLATE_DIR, TEMPLATE_STATIC_DIR, get_pages


app = FastAPI()

# Mount the "static" directory to serve static files
app.mount(
    "/static",
    StaticFiles(directory=TEMPLATE_STATIC_DIR),
    name="static",
)

# Favicon must be in the root for browsers to find it
@app.get('/favicon.ico')
def get_favicon():
    favicon_path = TEMPLATE_STATIC_DIR / 'favicon.ico'
    if favicon_path.exists():
        return FileResponse(
            path=favicon_path,
            filename='favicon.ico',
        )

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
        path=page.get('path'),
        endpoint=serve_template(page.get('template'), page.get('context')),
        methods=['GET'],
    )

@app.exception_handler(404)
async def custom_404(request: Request, exc):
    return templates.TemplateResponse(
        '404.html',
        context=dict(request=request),
    )

if __name__ == '__main__':
    uvicorn.run("serve_dev:app", port=8000)
