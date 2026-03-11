from http.server import SimpleHTTPRequestHandler, HTTPServer
import click
from pathlib import Path

from build import BUILD_DIR


class CustomHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BUILD_DIR, **kwargs)


@click.command()
@click.option(
    '-p',
    '--port',
    type=int,
    default=8000,
)
def run_server(port):
    server_address = ('', port)
    with HTTPServer(server_address, CustomHandler) as httpd:
        print(f"Serving at http://localhost:{port}")
        httpd.serve_forever()

if __name__ == '__main__':
    run_server()
