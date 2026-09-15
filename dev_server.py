#!/usr/bin/env python3
import http.server
import json
import os
import socketserver
import sys
from pathlib import Path

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
ROOT = Path(__file__).parent
WATCH_EXT = {'.html', '.js', '.css'}

def latest_mtime():
    latest = 0
    for p in ROOT.rglob('*'):
        if p.suffix in WATCH_EXT and p.is_file():
            m = p.stat().st_mtime
            if m > latest:
                latest = m
    return latest

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/__mtime':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(json.dumps({'mtime': latest_mtime()}).encode())
            return
        super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def log_message(self, *a, **k):
        pass

os.chdir(ROOT)
with socketserver.ThreadingTCPServer(('', PORT), Handler) as httpd:
    httpd.allow_reuse_address = True
    print(f'Serving on http://localhost:{PORT}')
    httpd.serve_forever()
