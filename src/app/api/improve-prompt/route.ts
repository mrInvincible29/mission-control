import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";
import { tmpdir } from "os";
import { join } from "path";

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const { prompt, useCase, sessionTarget } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const context = sessionTarget === "main"
      ? "a system event that triggers the main agent session"
      : "a standalone task for an isolated sub-agent session";

    const fullPrompt = `You are a prompt engineering expert. Improve this cron job prompt to be clearer, more specific, and effective. It will run as ${context}.

${useCase ? `Use case: ${useCase}\n` : ""}Original prompt:
${prompt}

Return ONLY the improved prompt text. No explanations, no wrapping.`;

    // Write prompt to temp file to avoid shell escaping issues
    const tmpFile = join(tmpdir(), `improve-${randomUUID()}.txt`);
    await writeFile(tmpFile, fullPrompt);

    try {
      const { stdout } = await execAsync(
        `cat '${tmpFile}' | claude --model claude-haiku-4-5-20250514 -p --no-input 2>/dev/null || cat '${tmpFile}' | claude -p 2>/dev/null`,
        { timeout: 30000, env: { ...process.env, PATH: process.env.PATH } }
      );

      const improved = stdout.trim();
      if (improved) {
        return NextResponse.json({ improvedPrompt: improved });
      }
      return NextResponse.json({ improvedPrompt: prompt });
    } finally {
      await unlink(tmpFile).catch(() => {});
    }
  } catch (error) {
    console.error("Improve prompt error:", error);
    return NextResponse.json(
      { error: "Failed to improve prompt. Claude CLI may not be available." },
      { status: 500 }
    );
  }
}
