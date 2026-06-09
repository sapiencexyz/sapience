// _shared/spawn.ts — process-spawning helpers used by apply/verify/ops.
//
// All three CLIs need to shell out to `forge`, `cast`, and `git`. Before this
// module they each had their own copy of the same node:child_process boilerplate.

import { spawn } from "node:child_process";

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Spawn a command and capture stdout + stderr. The `tee` flag mirrors output
 * to the parent's stdio while still recording it (useful for forge runs the
 * operator wants to watch live).
 */
export function captureSpawn(
  cmd: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
  tee = false,
): Promise<SpawnResult> {
  return new Promise<SpawnResult>((resolveProm) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...env },
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const s = chunk.toString();
      stdout += s;
      if (tee) process.stdout.write(s);
    });
    child.stderr.on("data", (chunk) => {
      const s = chunk.toString();
      stderr += s;
      if (tee) process.stderr.write(s);
    });
    child.on("close", (code) =>
      resolveProm({ stdout, stderr, exitCode: code ?? 1 }),
    );
    child.on("error", (err) =>
      resolveProm({
        stdout,
        stderr: stderr + "\n" + (err.message ?? String(err)),
        exitCode: 127,
      }),
    );
  });
}

/** `cast keccak <input>` — returns the 0x-prefixed digest. */
export async function castKeccak256(
  input: string,
  cwd: string,
): Promise<string> {
  const res = await captureSpawn("cast", ["keccak", input], cwd);
  if (res.exitCode !== 0)
    throw new Error(`cast keccak failed: ${res.stderr.slice(0, 200)}`);
  return res.stdout.trim();
}

/** `cast wallet address <pk>` — returns the checksummed deployer address. */
export async function castDeriveAddress(
  privateKey: string,
  cwd: string,
): Promise<string> {
  const res = await captureSpawn(
    "cast",
    ["wallet", "address", privateKey],
    cwd,
  );
  if (res.exitCode !== 0)
    throw new Error(`cast wallet address failed: ${res.stderr.slice(0, 200)}`);
  return res.stdout.trim();
}

/**
 * `cast block-number --rpc-url <url>` — returns the latest block number or
 * undefined if the RPC is unreachable. Best-effort.
 */
export async function castGetBlockNumber(
  rpcUrl: string,
  cwd: string,
): Promise<number | undefined> {
  const res = await captureSpawn(
    "cast",
    ["block-number", "--rpc-url", rpcUrl],
    cwd,
  );
  if (res.exitCode !== 0) return undefined;
  const n = Number(res.stdout.trim());
  return Number.isFinite(n) ? n : undefined;
}

/**
 * `cast code <address> --rpc-url <url>` — returns the 0x-prefixed runtime
 * bytecode currently deployed at `address`, or undefined when the RPC is
 * unreachable or the address has no code. Best-effort.
 */
export async function castGetCode(
  rpcUrl: string,
  address: string,
  cwd: string,
): Promise<string | undefined> {
  const res = await captureSpawn(
    "cast",
    ["code", address, "--rpc-url", rpcUrl],
    cwd,
  );
  if (res.exitCode !== 0) return undefined;
  const code = res.stdout.trim();
  // EOA / empty: cast returns "0x". Treat as "no code on chain".
  if (code === "" || code === "0x") return undefined;
  return code;
}

/** Short git SHA of the current HEAD, or undefined if not in a git tree. */
export async function readGitSha(cwd: string): Promise<string | undefined> {
  const res = await captureSpawn(
    "git",
    ["rev-parse", "--short", "HEAD"],
    cwd,
  );
  if (res.exitCode !== 0) return undefined;
  return res.stdout.trim() || undefined;
}

/** `forge build --ast --quiet` — must complete before plan/apply can run. */
export async function forgeBuild(cwd: string): Promise<SpawnResult> {
  return captureSpawn("forge", ["build", "--ast", "--quiet"], cwd);
}
