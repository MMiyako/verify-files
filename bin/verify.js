#!/usr/bin/env node

const { fork } = require("child_process");
const path = require("path");

const colors = {
    reset: "\x1b[0m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    gray: "\x1b[90m",
};

function showHelp() {
    console.log(`
${colors.cyan}Usage:${colors.reset} verify <sha1_file> [target_directory] --mode

${colors.yellow}You must specify a verification mode:${colors.reset}

  ${colors.green}--files, -f${colors.reset}      Verify file structure (Missing/Extra files)
                   ${colors.cyan}Supports flags:${colors.reset} -xd (exclude dir), -xf (exclude file)
  
  ${colors.green}--checksum, -c${colors.reset}   Verify file integrity (Corrupt/Modified files)

${colors.cyan}Examples:${colors.reset}
  verify list.sha1 ./app --files
  verify list.sha1 ./app --checksum
  verify list.sha1 ./app -f -xd "node_modules"
`);
}

function main() {
    // 1. Get arguments excluding 'node' and 'verify.js'
    const args = process.argv.slice(2);

    // 2. Scan for mode flags
    const isFilesMode = args.includes("--files") || args.includes("-f");
    const isChecksumMode = args.includes("--checksum") || args.includes("-c");

    // 3. Validation: No mode or Both modes selected
    if (!isFilesMode && !isChecksumMode) {
        console.error(`\n${colors.red}Error: No mode specified.${colors.reset}`);
        showHelp();
        process.exit(1);
    }

    if (isFilesMode && isChecksumMode) {
        console.error(`\n${colors.red}Error: Please select only one mode at a time.${colors.reset}`);
        process.exit(1);
    }

    // 4. Determine script to run
    const scriptToRun = isFilesMode ? "files.js" : "checksum.js";
    const scriptPath = path.join(__dirname, "../lib", scriptToRun);

    // 5. Filter out the mode flags to create the child argument list
    // We keep everything else (sha1 file, target dir, -xd, -xf, etc.)
    const childArgs = args.filter((arg) => !["--files", "-f", "--checksum", "-c"].includes(arg));

    // 6. Execute the script
    // 'fork' runs the module as a child process using the same V8 instance
    const child = fork(scriptPath, childArgs);

    child.on("exit", (code) => {
        process.exit(code);
    });
}

main();
