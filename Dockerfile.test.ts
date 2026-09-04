import fs from 'fs';
import path from 'path';

import { describe, it, expect } from 'vitest';

describe('Dockerfile', () => {
  const rootDir = path.resolve(__dirname);
  const dockerfile = fs.readFileSync(path.resolve(rootDir, 'Dockerfile'), 'utf8');

  it('should copy the pnpm lockfile instead of the npm one', () => {
    expect(dockerfile).toMatch(/^COPY package\.json pnpm-lock\.yaml \.\/$/m);
    expect(dockerfile).not.toMatch(/package-lock\.json/);
  });

  it('should install dependencies from the lockfile with pnpm', () => {
    expect(dockerfile).toMatch(/^RUN pnpm install --frozen-lockfile$/m);
  });

  it('should enable corepack without an interactive download prompt', () => {
    expect(dockerfile).toMatch(/^ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0$/m);
    expect(dockerfile).toMatch(/^RUN corepack enable$/m);
  });

  it('should build and start the app with pnpm', () => {
    expect(dockerfile).toMatch(/^RUN pnpm run build$/m);
    expect(dockerfile).toMatch(/^CMD \["pnpm", "start"\]$/m);
  });

  it('should not run any npm command', () => {
    const instructions = dockerfile
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'));

    expect(instructions.join('\n')).not.toMatch(/\bnpm\b/);
  });

  // corepack は package.json の packageManager フィールドから pnpm のバージョンを解決するため、
  // このフィールドが失われると Dockerfile のビルドが壊れる。
  it('should have a pnpm version pinned in package.json for corepack to resolve', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve(rootDir, 'package.json'), 'utf8'));

    expect(packageJson.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
    expect(packageJson.volta.pnpm).toBe(packageJson.packageManager.replace('pnpm@', ''));
  });

  it('should have a committed pnpm lockfile', () => {
    expect(fs.existsSync(path.resolve(rootDir, 'pnpm-lock.yaml'))).toBe(true);
    expect(fs.existsSync(path.resolve(rootDir, 'package-lock.json'))).toBe(false);
  });
});
