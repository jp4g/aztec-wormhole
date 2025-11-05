#!/usr/bin/env bun
import { dirname, join } from "path";
import { execCommand, copyFileWithLog, replaceInFile } from "./utils/cmd";

async function main() {
    try {

        // Get the script directory equivalent (packages/contracts/scripts/../ = packages/contracts/)
        const scriptDir = dirname(import.meta.path);
        const contractsDir = join(scriptDir, "..");
        console.log(`Working in contracts directory: ${contractsDir}...`);
        process.chdir(contractsDir);

        // remove old artifacts
        await execCommand("rm", ["-rf", "target"]);

        // compiling Wormhole Brige and Emitter Contracts
        console.log("Starting compilation...");
        await execCommand(
            "aztec-nargo",
            ["compile"],
            undefined,
            { VERSION: "3.0.0-devnet.3" }
        );
        console.log("Compilation completed, postprocessing artifacts...");
        await execCommand("aztec-postprocess-contract");

        // Generate TS bindings
        console.log("Generating TypeScript bindings...");
        await execCommand("aztec", ["codegen", "target", "--outdir", "target", "-f"]);

        const artifactsDir = join(contractsDir, "ts", "src", "artifacts");
        console.log("Moving artifacts to lib...")
        await copyFileWithLog(
            "./target/Wormhole.ts",
            join(artifactsDir, "wormhole", "Wormhole.ts")
        )
        await copyFileWithLog(
            "./target/wormhole_contracts-Wormhole.json",
            join(artifactsDir, "wormhole", "Wormhole.json")
        );
        await copyFileWithLog(
            "./target/WormholeEmitter.ts",
            join(artifactsDir, "emitter", "Emitter.ts")
        )
        await copyFileWithLog(
            "./target/emitter-WormholeEmitter.json",
            join(artifactsDir, "emitter", "Emitter.json")
        );

        // Update import paths
        console.log("Updating import paths...");
        await replaceInFile(
            join(artifactsDir, "wormhole", "Wormhole.ts"),
            "./wormhole_contracts-Wormhole.json",
            "./Wormhole.json"
        );
        await replaceInFile(
            join(artifactsDir, "emitter", "Emitter.ts"),
            "./emitter-WormholeEmitter.json",
            "./Emitter.json"
        );

        console.log("Compiled artifacts and packed artifacts for export successfully!");
    } catch (error) {
        console.error("Compilation failed:", error);
        process.exit(1);
    }
}

if (import.meta.main) {
    main();
}