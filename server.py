#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""RAS CRM local dev server.

Serves the static files AND exposes two endpoints that read/write a
single SQLite database file (ras_crm.sqlite) in the server's working
directory.

Why this exists: the app's data is a SQLite database. If we store it
in the browser's IndexedDB, it's tied to the page origin — different
ports / different host names (localhost vs 127.0.0.1) get different
IndexedDBs and the data appears empty.

By moving the SQLite bytes to a real file on disk and serving them
through HTTP endpoints, the data follows the directory the server is
running from, regardless of which port or hostname the user opens.

Usage:
    python server.py [port]                # default port 8000
    Then open: http://127.0.0.1:8000/ras_crm.html

Endpoints:
    GET  /api/load-db   -> 200 + raw SQLite bytes, or 404 if no file
    POST /api/save-db   -> body is the raw SQLite bytes; written to disk
"""
import http.server
import os
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
DATA_FILE = 'ras_crm.sqlite'
DATA_DIR = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/load-db':
            self._load_db()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == '/api/save-db':
            self._save_db()
        else:
            self.send_error(404, 'Unknown endpoint')

    def _load_db(self):
        path = os.path.join(DATA_DIR, DATA_FILE)
        if not os.path.exists(path):
            self.send_response(404)
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            return
        try:
            with open(path, 'rb') as f:
                data = f.read()
            self.send_response(200)
            self.send_header('Content-Type', 'application/octet-stream')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(data)
        except OSError as e:
            self.send_error(500, str(e))

    def _save_db(self):
        path = os.path.join(DATA_DIR, DATA_FILE)
        try:
            length = int(self.headers.get('Content-Length', 0))
            data = self.rfile.read(length) if length > 0 else b''
            # Atomic write: tmp file, then rename. Prevents half-written data
            # if the request is interrupted mid-flight.
            tmp_path = path + '.tmp'
            with open(tmp_path, 'wb') as f:
                f.write(data)
            os.replace(tmp_path, path)
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(b'OK')
        except OSError as e:
            self.send_error(500, str(e))

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        # Quiet by default; uncomment to debug
        # super().log_message(fmt, *args)
        pass


if __name__ == '__main__':
    os.chdir(DATA_DIR)
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('', PORT), Handler) as httpd:
        print('=' * 60)
        print(f'  RAS CRM dev server')
        print(f'  Open:   http://127.0.0.1:{PORT}/ras_crm.html')
        print(f'          http://localhost:{PORT}/ras_crm.html  (also works)')
        print(f'  Data:   {os.path.join(DATA_DIR, DATA_FILE)}')
        print(f'  Press Ctrl+C to stop')
        print('=' * 60)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nShutting down...')
            httpd.shutdown()
