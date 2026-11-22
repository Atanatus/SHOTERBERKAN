#!/usr/bin/env python3
"""V41 Chromium smoke test with the real FrutiDry document and HTTP modules.

Requires Playwright, which is installed in GitHub Actions browser job.
No Firebase or Render services are required: the production gate defaults to OFF.
"""
from __future__ import annotations
import functools
import http.server
from pathlib import Path
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def main():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    origin = f'http://127.0.0.1:{server.server_port}'
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True, args=['--no-sandbox'])
            try:
                for width, height in [(320,640),(390,844),(844,390),(1366,768)]:
                    context = browser.new_context(viewport={'width':width,'height':height})
                    page = context.new_page()
                    errors = []
                    external = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.on('request', lambda request: external.append(request.url) if 'gstatic.com/firebasejs/' in request.url else None)
                    page.goto(origin+'/index.html', wait_until='load', timeout=30000)
                    page.wait_for_function('window.__FRUTIDRY_BOOT_READY__ === true', timeout=15000)
                    page.wait_for_function("document.getElementById('accountStatus').textContent.includes('Registro cerrado')", timeout=15000)
                    page.locator('#btnAccount').click()
                    assert page.locator('#accountModal').get_attribute('aria-hidden') == 'false'
                    assert page.locator('#accountUnavailable').is_visible()
                    assert page.locator('#accountAuthPanel').is_hidden()
                    assert page.evaluate('paused') is True
                    assert not external, f'Firebase SDK loaded while accounts disabled: {external}'
                    page.locator('#accountClose').click()
                    assert page.locator('#accountModal').get_attribute('aria-hidden') == 'true'
                    assert page.evaluate('paused') is False
                    page.locator('#btnAccount').click()
                    page.locator('#btnTournament').click()
                    assert page.locator('#accountModal').get_attribute('aria-hidden') == 'true'
                    assert page.locator('#tournamentModal').get_attribute('aria-hidden') == 'false'
                    assert page.evaluate('paused') is True
                    assert not errors, f'JavaScript error at {width}x{height}: {errors}'
                    print(f'OK V41: {width}x{height} account, tabs, pause, SDK off', flush=True)
                    context.close()
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()

if __name__ == '__main__':
    main()
