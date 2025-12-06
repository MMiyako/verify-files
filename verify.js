#!/usr/bin/env node

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs").promises;

// Colors for terminal output
const colors = {
    reset: "\x1b[0m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    gray: "\x1b[90m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
};

function showHelp() {
    console.log(`
${colors.cyan}Verify Tool - File and Checksum Verification${colors.reset}

${colors.cyan}Usage:${colors.reset}
  verify [options] <sha1-file>

${colors.cyan}Options:${colors.reset}
  -f, --files         Compare file list only
  -c, --checksum      Verify checksums (default mode)
  -h, --help          Show this help message

${colors.cyan}Examples:${colors.reset}
  verify -c ./base.sha1          Verify checksums
  verify -f ./base.sha1          Verify file lists
  verify ./base.sha1             Verify file lists (default)
`);
}

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        file: null,
        mode: null,
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === "-f" || arg === "--files") {
            options.mode = "files";
            if (args[i + 1] && !args[i + 1].startsWith("-")) {
                options.file = args[i + 1];
                i++;
            }
        } else if (arg === "-c" || arg === "--checksum") {
            options.mode = "checksum";
            if (args[i + 1] && !args[i + 1].startsWith("-")) {
                options.file = args[i + 1];
                i++;
            }
        } else if (arg === "-h" || arg === "--help") {
            showHelp();
            process.exit(0);
        }
    }

    return options;
}

function runScript(scriptName, args = []) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, scriptName);
        const child = spawn("node", [scriptPath, ...args], {
            stdio: "inherit",
        });

        child.on("close", (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Script ${scriptName} exited with code ${code}`));
            }
        });

        child.on("error", (error) => {
            reject(error);
        });
    });
}

async function main() {
    try {
        const options = parseArgs();

        // Validate arguments
        if (!options.file) {
            showHelp();
            process.exit(1);
        }

        if (!options.mode) {
            options.mode = "files";
        }

        // Check if file exists
        try {
            await fs.access(options.file);
        } catch (error) {
            console.error(`${colors.red}Error:${colors.reset} SHA1 file not found: ${options.file}`);
            process.exit(1);
        }

        console.log(
            `${colors.blue}Mode: ${options.mode === "files" ? "File List Verification" : "Checksum Verification"}${
                colors.reset
            }\n`
        );

        if (options.mode === "files") {
            await runScript("files.js", [options.file]);
        } else {
            // For checksum mode, we need to pass the method
            await runScript("checksum.js", [options.file]);
        }

        console.log(`\n${colors.green}Done!${colors.reset}`);
    } catch (error) {
        console.error(`${colors.red}Error:${colors.reset}`, error.message);
        process.exit(1);
    }
}

// Handle Ctrl+C
process.on("SIGINT", () => {
    console.log("\n\nVerification interrupted by user");
    process.exit(0);
});

main();
