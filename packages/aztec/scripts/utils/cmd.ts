import { spawn } from "bun";
import { constants } from "fs";
import { access, copyFile, readFile, writeFile } from "fs/promises";
import { delimiter, join } from "path";

export async function execCommand(
  command: string,
  args: string[] = [],
  cwd?: string,
  env?: Record<string, string>
): Promise<void> {
  const resolvedCommand = await resolveCommandPath(command);
  const proc = spawn({
    cmd: [resolvedCommand, ...args],
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    env: { ...process.env, ...env }
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')} (exit code: ${exitCode})`);
  }
}

export async function copyFileWithLog(src: string, dest: string): Promise<void> {
  try {
    await copyFile(src, dest);
    console.log(`Copied: ${src} → ${dest}`);
  } catch (error) {
    throw new Error(`Failed to copy ${src} to ${dest}: ${error}`);
  }
}

export async function replaceInFile(filePath: string, searchText: string, replaceText: string): Promise<void> {
  try {
    const content = await readFile(filePath, "utf-8");
    const updatedContent = content.replace(new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), replaceText);
    await writeFile(filePath, updatedContent, "utf-8");
    console.log(`Updated imports in: ${filePath}`);
  } catch (error) {
    throw new Error(`Failed to update file ${filePath}: ${error}`);
  }
}

//todo: figure out graceful way for @aztec/cli to not be a shitheel

async function resolveCommandPath(command: string): Promise<string> {
  if (command.includes("/") || command.includes("\\")) {
    return command;
  }

  const pathEnv = process.env.PATH ?? "";
  if (!pathEnv) {
    return command;
  }

  const dirs = pathEnv.split(delimiter).filter(Boolean);
  if (dirs.length === 0) {
    return command;
  }

  const orderedDirs = [
    ...dirs.filter(dir => !dir.includes("node_modules/.bin")),
    ...dirs.filter(dir => dir.includes("node_modules/.bin")),
  ];

  for (const dir of orderedDirs) {
    const candidate = join(dir, command);
    if (await canExecute(candidate)) {
      return candidate;
    }

    if (process.platform === "win32") {
      const candidateExe = `${candidate}.exe`;
      if (await canExecute(candidateExe)) {
        return candidateExe;
      }
    }
  }

  return command;
}

async function canExecute(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
