import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface FileStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
}

/** Files on the local disk. contentType is accepted for interface parity and not used. */
export class LocalStorage implements FileStorage {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    const p = path.resolve(this.root, key);
    if (!p.startsWith(path.resolve(this.root))) throw new Error("Storage key escapes root");
    return p;
  }

  async put(key: string, bytes: Uint8Array, _contentType: string): Promise<void> {
    const p = this.resolve(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, bytes);
  }

  async get(key: string): Promise<Uint8Array> {
    return readFile(this.resolve(key));
  }
}

export function storageFromEnv(repoRoot: string): FileStorage {
  const dir = process.env.STORAGE_DIR ?? "./data/files";
  return new LocalStorage(path.isAbsolute(dir) ? dir : path.resolve(repoRoot, dir));
}

export function documentKey(userId: string, applicationId: string, type: string, version: number, ext: string): string {
  return `${userId}/${applicationId}/${type.toLowerCase()}-v${version}.${ext}`;
}
