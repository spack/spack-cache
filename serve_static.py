from http.server import SimpleHTTPRequestHandler, HTTPServer
import click
from pathlib import Path

from build import BUILD_DIR


class CustomHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BUILD_DIR, **kwargs)

    def do_GET(self):
        # Allow html files to be served even if they lack the .html extension
        full_path = Path(self.translate_path(self.path))
        if 'static' not in str(full_path) and full_path.is_file() and full_path.exists():
            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            with open(full_path, 'rb') as f:
                self.wfile.write(f.read())
            return
        super().do_GET()


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
