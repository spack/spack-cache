from http.server import SimpleHTTPRequestHandler, HTTPServer
import click

from build import BUILD_DIR


REDIRECT_PAGE = BUILD_DIR / '404.html'


class Custom404Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BUILD_DIR, **kwargs)

    def send_error(self, code, message=None, explain=None):
        print('error!')
        if code == 404 and REDIRECT_PAGE.exists():
            with open(REDIRECT_PAGE, 'r') as f:
                self.error_message_format = f.read()
        super().send_error(code, message, explain)


@click.command()
@click.option(
    '-p',
    '--port',
    type=int,
    default=8000,
)
def run_server(port):
    server_address = ('', port)
    with HTTPServer(server_address, Custom404Handler) as httpd:
        print(f"Serving at http://localhost:{port}")
        httpd.serve_forever()

if __name__ == '__main__':
    run_server()
