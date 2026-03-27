import { NextRequest, NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";

type AskBody = {
  query?: string;
  top_k?: number;
};

function runPythonAnswer(query: string, topK: number): Promise<string> {
  const scriptPath = path.join(process.cwd(), "scripts", "api_answer.py");

  return new Promise((resolve, reject) => {
    const child = spawn("python3", [
      scriptPath,
      "--query",
      query,
      "--top-k",
      String(topK),
    ]);

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => reject(err));

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Python process exited with code ${code}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AskBody;
    const query = body.query?.trim();
    const topK = body.top_k && body.top_k > 0 ? body.top_k : 3;

    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    const output = await runPythonAnswer(query, topK);
    const parsed = JSON.parse(output);
    return NextResponse.json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown backend error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
