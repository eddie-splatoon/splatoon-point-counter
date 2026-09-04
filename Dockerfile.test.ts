import fs from 'fs';
import path from 'path';

import { describe, it, expect } from 'vitest';

const rootDir = path.resolve(__dirname);
const dockerfilePath = path.resolve(rootDir, 'Dockerfile');

const readDockerfile = () => fs.readFileSync(dockerfilePath, 'utf8');

// コメント行を除いた命令部分のみを対象にする。コメントには移行前後の経緯として
// npm / package-lock.json への言及が残りうるため、命令とは区別して扱う。
const instructionsOf = (dockerfile: string): string =>
  dockerfile
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n');

describe('Dockerfile', () => {
  it('should exist', () => {
    expect(fs.existsSync(dockerfilePath)).toBe(true);
  });

  it('should install dependencies from the pnpm lockfile', () => {
    const instructions = instructionsOf(readDockerfile());

    expect(instructions).toMatch(/^COPY\s+.*\bpnpm-lock\.yaml\b/m);
    expect(instructions).toMatch(/^RUN\s+.*\bpnpm install\b.*--frozen-lockfile\b/m);
  });

  it('should enable corepack without an interactive download prompt', () => {
    const instructions = instructionsOf(readDockerfile());

    expect(instructions).toMatch(/^ENV\s+COREPACK_ENABLE_DOWNLOAD_PROMPT=0$/m);
    expect(instructions).toMatch(/^RUN\s+corepack enable\b/m);
  });

  it('should build the app with pnpm', () => {
    const instructions = instructionsOf(readDockerfile());

    expect(instructions).toMatch(/^RUN\s+.*\bpnpm run build\b/m);
  });

  // パッケージマネージャ経由で起動すると、PID 1 となったそのプロセスが SIGTERM を
  // 子へ転送せず、docker stop が graceful shutdown ではなく SIGKILL (exit 137) になる。
  it('should start the app without going through a package manager so that SIGTERM is delivered', () => {
    const cmd = instructionsOf(readDockerfile()).match(/^CMD\s+(\[.*\])$/m);

    expect(cmd).not.toBeNull();
    const argv = JSON.parse(cmd![1]) as string[];
    expect(argv[0]).not.toMatch(/(^|\/)(npm|pnpm|yarn)$/);
    expect(argv.join(' ')).toMatch(/\bnext\b.*\bstart\b/);
  });

  it('should not reference npm or its lockfile in any instruction', () => {
    const instructions = instructionsOf(readDockerfile());

    expect(instructions).not.toMatch(/\bnpm\b/);
    expect(instructions).not.toMatch(/package-lock\.json/);
  });

  // corepack は package.json の packageManager フィールドから pnpm のバージョンを解決するため、
  // このフィールドが失われると Dockerfile のビルドが壊れる。
  it('should have a pnpm version pinned in package.json for corepack to resolve', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve(rootDir, 'package.json'), 'utf8'));

    // `corepack use` はハッシュ付き (pnpm@10.34.5+sha512.<hash>) で書き込むため、それも許容する。
    expect(packageJson.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+(\+sha\d+\..+)?$/);

    // Volta と corepack が別々のバージョンを解決してしまわないよう、両者の一致を保証する。
    const corepackVersion = packageJson.packageManager.replace('pnpm@', '').split('+')[0];
    expect(packageJson.volta?.pnpm).toBe(corepackVersion);
  });

  it('should have a committed pnpm lockfile', () => {
    expect(fs.existsSync(path.resolve(rootDir, 'pnpm-lock.yaml'))).toBe(true);
    expect(fs.existsSync(path.resolve(rootDir, 'package-lock.json'))).toBe(false);
  });
});
