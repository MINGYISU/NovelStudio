import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Harness } from './test-support.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const publicDir = path.join(root, 'public');

interface Manifest {
  name: string;
  start_url: string;
  scope: string;
  display: string;
  icons: { src: string; sizes: string; type: string }[];
}

const manifest = JSON.parse(
  fs.readFileSync(path.join(publicDir, 'manifest.webmanifest'), 'utf8'),
) as Manifest;

describe('PWA manifest (Chrome/Edge "Install app")', () => {
  it('has the fields the installability check needs', () => {
    expect(manifest.name).toBe('NovelStudio');
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(['standalone', 'minimal-ui', 'fullscreen']).toContain(manifest.display);
    const sizes = manifest.icons.map((i) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });

  it('points at real PNG icons of the declared size', () => {
    for (const icon of manifest.icons) {
      const file = path.join(publicDir, icon.src);
      const bytes = fs.readFileSync(file);
      expect(icon.type).toBe('image/png');
      expect(bytes.subarray(1, 4).toString()).toBe('PNG');
      const [w, h] = icon.sizes.split('x').map(Number);
      expect(bytes.readUInt32BE(16)).toBe(w);
      expect(bytes.readUInt32BE(20)).toBe(h);
    }
  });

  it('is linked from index.html, with no external host anywhere', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(JSON.stringify(manifest)).not.toMatch(/https?:\/\//);
  });
});

describe('serving the manifest (production client directory)', () => {
  let h: Harness;
  let clientDir: string;
  beforeEach(async () => {
    clientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novelstudio-test-client-'));
    fs.cpSync(publicDir, clientDir, { recursive: true });
    fs.writeFileSync(path.join(clientDir, 'index.html'), '<!doctype html><title>x</title>');
    h = await new Harness({ clientDir, production: true }).start();
  });
  afterEach(async () => {
    await h.cleanup();
    fs.rmSync(clientDir, { recursive: true, force: true });
  });

  it('serves /manifest.webmanifest and the icons under the strict Host check', async () => {
    const res = await h.api('GET', '/manifest.webmanifest');
    expect(res.statusCode).toBe(200);
    expect(String(res.headers['content-type'])).toMatch(/manifest\+json|application\/json/);
    expect(JSON.parse(res.body)).toEqual(manifest);

    const icon = await h.api('GET', '/icons/icon-192.png');
    expect(icon.statusCode).toBe(200);
    expect(icon.headers['content-type']).toBe('image/png');

    const evil = await h.app.inject({
      method: 'GET',
      url: '/manifest.webmanifest',
      headers: { host: 'evil.com' },
    });
    expect(evil.statusCode).toBe(403);
  });
});
