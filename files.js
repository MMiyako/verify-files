const fs = require("fs").promises;
const path = require("path");
const { readdir } = require("fs").promises;

// Add colors
const colors = {
    reset: "\x1b[0m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    gray: "\x1b[90m",
};

async function findConfigDirectories(dir) {
    const configDirs = [];

    async function search(currentDir) {
        try {
            const items = await readdir(currentDir, { withFileTypes: true });

            for (const item of items) {
                if (item.isDirectory()) {
                    const fullPath = path.join(currentDir, item.name);

                    // Check if this is a config directory
                    if (item.name.toLowerCase() === "config") {
                        configDirs.push(fullPath);
                    }

                    // Recursively search subdirectories (except config directories we just found)
                    await search(fullPath);
                }
            }
        } catch (error) {
            // Skip directories we can't access
            console.log(`${colors.gray}Warning: Cannot access ${currentDir}${colors.reset}`);
        }
    }

    await search(dir);
    return configDirs;
}

async function getFileList(dir, baseDir, excludeDirs) {
    let files = [];
    const items = await readdir(dir, { withFileTypes: true });

    for (const item of items) {
        const fullPath = path.join(dir, item.name);
        const resolvedFullPath = path.resolve(fullPath);

        // Check if this path should be excluded
        let shouldExclude = false;
        for (const excludeDir of excludeDirs) {
            if (excludeDir && resolvedFullPath.startsWith(path.resolve(excludeDir))) {
                shouldExclude = true;
                break;
            }
        }

        if (shouldExclude) {
            continue;
        }

        if (item.isDirectory()) {
            files = files.concat(await getFileList(fullPath, baseDir, excludeDirs));
        } else {
            // Get path relative to baseDir
            const relativePath = path.relative(baseDir, fullPath);
            files.push(relativePath.replace(/\\/g, "/"));
        }
    }
    return files;
}

async function main() {
    try {
        // Parse command line arguments
        const args = process.argv.slice(2);

        // Find flags
        const ignoreConfigFlag = args.includes("-i") || args.includes("--ignore");

        // Remove flags from args
        const filteredArgs = args.filter((arg) => !["-i", "--ignore"].includes(arg));

        const sha1File = filteredArgs[0];
        const targetDirArg = filteredArgs[1]; // Optional second argument

        // Resolve SHA1 file path and get its directory
        const sha1FilePath = path.resolve(sha1File);
        const sha1Dir = path.dirname(sha1FilePath);

        // Determine target directory:
        // 1. Use the provided target directory if given
        // 2. Otherwise, use the SHA1 file's directory
        const targetDir = targetDirArg ? path.resolve(targetDirArg) : sha1Dir;

        const parsed = path.parse(sha1FilePath);
        const sha1FileName = parsed.name;

        // Build exclude directories list
        const excludeDirs = [];

        // Find and add config directories if ignore flag is set
        let configDirs = [];
        if (ignoreConfigFlag) {
            configDirs = await findConfigDirectories(targetDir);
            if (configDirs.length > 0) {
                excludeDirs.push(...configDirs);
            }
        }

        // Read and parse SHA1 file
        const sha1Data = await fs.readFile(sha1FilePath, "utf8");
        const expectedFiles = sha1Data
            .split("\n")
            .filter((line) => line.trim().length >= 11)
            .map((line) => {
                const filePath = line.substring(11).trim();
                return filePath.replace(/\\/g, "/");
            });

        console.log(`${colors.cyan}SHA1 file:${colors.reset} ${sha1FilePath}`);
        console.log(`${colors.cyan}Target directory:${colors.reset} ${targetDir}`);

        // Display excluded directories information
        if (ignoreConfigFlag) {
            console.log(`${colors.cyan}Excluding:${colors.reset}`);

            if (configDirs.length > 0) {
                console.log(`  - Config directories:`);
                configDirs.forEach((dir) => console.log(`    * ${path.relative(targetDir, dir) || "."}`));
            } else {
                console.log(`  - Config directories: None found`);
            }
        }

        console.log(`${colors.cyan}Expected files in SHA1:${colors.reset} ${expectedFiles.length}\n`);

        // Get actual files in target directory, excluding specified directories
        const actualFiles = await getFileList(targetDir, targetDir, excludeDirs);

        // Convert to Sets for efficient lookup
        const expectedSet = new Set(expectedFiles);
        const actualSet = new Set(actualFiles);

        // Identify missing and extra files
        const missing = expectedFiles.filter((file) => !actualSet.has(file));
        const extra = actualFiles.filter((file) => !expectedSet.has(file));

        // Save results
        const missingFile = `${sha1FileName}_missing_files.txt`;
        const extraFile = `${sha1FileName}_extra_files.txt`;

        await fs.writeFile(sha1Dir + "/" + missingFile, missing.join("\n"));
        await fs.writeFile(sha1Dir + "/" + extraFile, extra.join("\n"));

        console.log(`${colors.green}Comparison complete.${colors.reset}`);
        console.log(`${colors.yellow}- Missing files:${colors.reset} ${missing.length} (saved to ${missingFile})`);
        console.log(`${colors.yellow}- Extra files:${colors.reset} ${extra.length} (saved to ${extraFile})`);

        // Debug output
        if (missing.length > 0) {
            console.log(`\n${colors.red}Sample missing files:${colors.reset}`);
            missing.slice(0, 5).forEach((file) => console.log(`  ${file}`));
            if (missing.length > 5) {
                console.log(`  ${colors.gray}... and ${missing.length - 5} more${colors.reset}`);
            }
        }

        if (extra.length > 0) {
            console.log(`\n${colors.red}Sample extra files:${colors.reset}`);
            extra.slice(0, 5).forEach((file) => console.log(`  ${file}`));
            if (extra.length > 5) {
                console.log(`  ${colors.gray}... and ${extra.length - 5} more${colors.reset}`);
            }
        }
    } catch (error) {
        console.error(`${colors.red}Error:${colors.reset}`, error.message);
        process.exit(1);
    }
}

main();
