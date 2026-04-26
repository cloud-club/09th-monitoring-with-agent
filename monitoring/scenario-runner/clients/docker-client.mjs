import { execText } from "../lib/processes.mjs";

const ALLOWED_CONTAINERS = new Set(["mwa-backend", "mwa-postgres", "mwa-promtail", "mwa-tempo"]);

function assertAllowedContainer(container) {
  if (!ALLOWED_CONTAINERS.has(container)) {
    throw new Error(`Container is not allowed: ${container}`);
  }
}

export async function docker(action, container) {
  assertAllowedContainer(container);
  try {
    await execText("docker", [action, container], { timeout: 90_000 });
  } catch (error) {
    const stderr = String(error.stderr || error.message || "");
    if (action !== "start" || !stderr.includes("is already running")) {
      throw error;
    }
  }
  console.log(`docker ${action} ${container}`);
}

export async function dockerExec(container, args, timeout = 60_000) {
  assertAllowedContainer(container);
  await execText("docker", ["exec", container, ...args], { timeout });
  console.log(`docker exec ${container} ${args.join(" ")}`);
}
