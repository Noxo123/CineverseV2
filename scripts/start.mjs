import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const children = new Map();
let shuttingDown = false;

function start(name, args) {
  const child = spawn(npm, args, {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32"
  });

  children.set(name, child);
  child.on("error", error => {
    console.error(`[${name}] Impossible de démarrer le processus :`, error.message);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    children.delete(name);
    if (!shuttingDown) {
      console.error(`[${name}] Arrêt inattendu (code=${code}, signal=${signal}).`);
      shutdown(code ?? 1);
    }
  });
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\nArrêt des services Cinéverse…");

  for (const child of children.values()) {
    if (child.exitCode === null && !child.killed) {
      if (process.platform === "win32" && child.pid) {
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true
        });
      } else {
        child.kill("SIGTERM");
      }
    }
  }

  const forceExit = setTimeout(() => process.exit(exitCode), 2500);
  forceExit.unref();
  if (children.size === 0) process.exit(exitCode);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("======================================");
console.log("        CINÉVERSE V2 — LOCAL");
console.log("======================================");
console.log("API      : démarrage du serveur…");
console.log("Frontend : démarrage de Vite…");
console.log("Arrêt    : Ctrl+C");
console.log("");

start("API", ["run", "dev", "--workspace", "@cineverse/api"]);
start("WEB", ["run", "dev", "--workspace", "@cineverse/web"]);
