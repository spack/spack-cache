import uvicorn

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from build import TEMPLATE_DIR, TEMPLATE_STATIC_DIR, get_context_data
from data import PACKAGE_DATA_PATH, SPECS_DATA_PATH, load_data


app = FastAPI()
templates = Jinja2Templates(directory=TEMPLATE_DIR)
context_data = get_context_data()

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

# Define root path
@app.get('/')
def get_root(request: Request):
    return templates.TemplateResponse(
        name='index.html',
        context=context_data,
        request=request,
    )

# Run with uvicorn
if __name__ == '__main__':
    uvicorn.run("serve_dev:app", port=8000)
