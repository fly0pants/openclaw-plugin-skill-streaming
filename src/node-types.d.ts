// Minimal type declarations for Node.js built-in modules used in this project.
// These are provided locally because @types/node is not available in this environment.

declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf-8"): string;
  export function readFileSync(path: string, options: { encoding: "utf-8" }): string;
  export function readFileSync(path: string, encoding?: string | null): string | Buffer;
}

declare module "node:path" {
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
  export function dirname(path: string): string;
  export function basename(path: string, ext?: string): string;
}
