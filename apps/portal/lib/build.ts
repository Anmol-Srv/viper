// Builds and pushes a Viper project's Docker image via the colima-coolify docker context —
// the VM's dockerd, driven from the Mac. See SPEC §3.5.
import { spawn } from "child_process";

const DOCKER_CONTEXT = process.env.DOCKER_CONTEXT || "colima-coolify";
const REGISTRY = process.env.REGISTRY || "localhost:5000";

function run(args: string[], onLine: (line: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("docker", args);
    let tail = "";
    const pipe = (stream: NodeJS.ReadableStream) => {
      let buf = "";
      stream.on("data", (chunk: Buffer) => {
        buf += chunk.toString();
        let idx: number;
        while ((idx = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (line) {
            onLine(line);
            tail = (tail + "\n" + line).slice(-2000);
          }
        }
      });
      stream.on("end", () => {
        if (buf.trim()) {
          onLine(buf);
          tail = (tail + "\n" + buf).slice(-2000);
        }
      });
    };
    pipe(proc.stdout);
    pipe(proc.stderr);
    proc.on("error", (e) => reject(new Error(`docker ${args[0]} failed to start: ${e.message}`)));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`docker ${args.join(" ")} exited ${code}:\n${tail}`));
    });
  });
}

export async function buildAndPush(opts: {
  srcDir: string;
  subdomain: string;
  tag: string;
  onLine: (line: string) => void;
}): Promise<{ image: string; tag: string }> {
  const image = `${REGISTRY}/viper-${opts.subdomain}`;
  await run(["--context", DOCKER_CONTEXT, "build", "-t", `${image}:${opts.tag}`, opts.srcDir], opts.onLine);
  await run(["--context", DOCKER_CONTEXT, "push", `${image}:${opts.tag}`], opts.onLine);
  return { image, tag: opts.tag };
}
