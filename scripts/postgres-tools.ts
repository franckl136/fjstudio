import { spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url));

function localDocker(): string[] {
  const override = process.env.DOCKER_HOST;
  const selectedContext = process.env.DOCKER_CONTEXT;
  if (override && !selectedContext) {
    if (!override.startsWith("unix:///") && !override.startsWith("npipe:////./pipe/")) {
      throw new Error("Les sauvegardes A1 exigent un moteur Docker local.");
    }
    return ["--host", override];
  }

  const context = selectedContext ?? dockerOutput(["context", "show"]);
  const endpoint = dockerOutput(["context", "inspect", context, "--format", "{{.Endpoints.docker.Host}}"]);
  if (!endpoint.startsWith("unix:///") && !endpoint.startsWith("npipe:////./pipe/")) {
    throw new Error("Les sauvegardes A1 exigent un contexte Docker local.");
  }
  return ["--context", context];
}

function dockerOutput(args: string[]): string {
  const result = spawnSync("docker", args, { cwd: repository, encoding: "utf8", timeout: 10_000 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Impossible d’identifier le moteur Docker local (${result.status}).`);
  }
  return result.stdout.trim();
}

export function composeArguments(): string[] {
  return [...localDocker(), "compose", "--env-file", ".env.local", "--file", "compose.yaml"];
}

function databasePort(): string {
  const binding = dockerOutput([...composeArguments(), "port", "db", "5432"]);
  const port = /^127\.0\.0\.1:(\d+)$/.exec(binding)?.[1];
  if (!port) throw new Error("Le service PostgreSQL A1 doit être publié uniquement sur 127.0.0.1.");
  return port;
}

export function composeDatabaseUrl(connectionString = process.env.DATABASE_URL): URL {
  const url = new URL(connectionString ?? "");
  if (url.protocol !== "postgresql:" || url.hostname !== "127.0.0.1" || url.username !== "fjstudio" ||
      url.port !== databasePort() || !url.password || url.search || url.hash ||
      !/^\/fjstudio_a1(?:_(?:test|restore)_[a-z0-9_]{1,40})?$/.test(url.pathname)) {
    throw new Error("DATABASE_URL doit correspondre à une base du service PostgreSQL A1 local.");
  }
  return url;
}

function waitForDocker(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`L’outil PostgreSQL a échoué (${signal ?? code}).`));
    });
  });
}

export async function postgresTool(
  command: "pg_dump" | "pg_restore" | "createdb",
  args: string[],
  input?: Readable,
  output?: Writable,
): Promise<void> {
  const child = spawn(
    "docker",
    [
      ...composeArguments(), "exec", "-T", "db",
      "sh", "-eu", "-c",
      'unset PGSERVICE PGSERVICEFILE; exec "$0" -h /var/run/postgresql -p 5432 -U "${POSTGRES_USER:?}" "$@"',
      command, ...args,
    ],
    { cwd: repository, stdio: [input ? "pipe" : "ignore", output ? "pipe" : "ignore", "inherit"] },
  );
  const completion = waitForDocker(child);
  const streams: Promise<void>[] = [];
  if (input && child.stdin) streams.push(pipeline(input, child.stdin));
  if (output && child.stdout) streams.push(pipeline(child.stdout, output));

  try {
    await Promise.all([completion, ...streams]);
  } catch (error) {
    child.kill();
    await Promise.allSettled([completion, ...streams]);
    throw error;
  }
}
