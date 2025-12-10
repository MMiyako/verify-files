const fs = require("fs").promises;
const path = require("path");
const { readdir } = require("fs").promises;

const colors = {
    reset: "\x1b[0m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    gray: "\x1b[90m",
};

/**
 * Converts a shell-style wildcard pattern (e.g., "*.js", "app/conf*")
 * into a JavaScript RegExp.
 */
function globToRegex(glob) {
    // 1. Escape special regex characters (except *)
    // We escape: . + ? ^ $ { } ( ) | [ ] \
    let regexString = glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

    // 2. Convert wildcard '*' to regex '.*'
    regexString = regexString.replace(/\*/g, ".*");

    // 3. Anchor start and end to ensure full match
    return new RegExp(`^${regexString}$`, "i"); // 'i' flag for case-insensitive matching
}

/**
 * Normalizes paths to use forward slashes consistently.
 * Important for matching patterns across Windows/Linux.
 */
function normalizePath(p) {
    return p.replace(/\\/g, "/");
}

/**
 * Categorizes and compiles ignore patterns.
 */
function processIgnoreList(rawList, rootDir) {
    const namePatterns = []; // For "config*", "*.js"
    const pathPatterns = []; // For "app/config*", "src/*.js"

    rawList.forEach((item) => {
        // Normalize input immediately
        const normalizedItem = normalizePath(item);

        // If it contains a slash, it's a specific PATH pattern
        if (normalizedItem.includes("/")) {
            // Resolve to absolute path, then normalize again
            const absPath = normalizePath(path.resolve(rootDir, item));
            pathPatterns.push(globToRegex(absPath));
        } else {
            // No slash, it's a generic NAME pattern
            namePatterns.push(globToRegex(normalizedItem));
        }
    });

    return { namePatterns, pathPatterns };
}

async function getFileList(dir, baseDir, ignoreRules) {
    let files = [];

    try {
        const items = await readdir(dir, { withFileTypes: true });

        for (const item of items) {
            const fullPath = path.join(dir, item.name);
            const normalizedFullPath = normalizePath(fullPath);

            if (item.isDirectory()) {
                // --- IGNORE DIRECTORY CHECKS ---

                // 1. Check by Name Pattern (e.g. "config*", "test_*")
                if (ignoreRules.dirNames.some((regex) => regex.test(item.name))) {
                    continue;
                }

                // 2. Check by Path Pattern (e.g. "app/config*")
                if (ignoreRules.dirPaths.some((regex) => regex.test(normalizedFullPath))) {
                    continue;
                }

                // Recurse
                files = files.concat(await getFileList(fullPath, baseDir, ignoreRules));
            } else {
                // --- IGNORE FILE CHECKS ---

                // 1. Check by Name Pattern (e.g. "*.js", "*.log")
                if (ignoreRules.fileNames.some((regex) => regex.test(item.name))) {
                    continue;
                }

                // 2. Check by Path Pattern (e.g. "app/*.js")
                if (ignoreRules.filePaths.some((regex) => regex.test(normalizedFullPath))) {
                    continue;
                }

                const relativePath = path.relative(baseDir, fullPath);
                files.push(normalizePath(relativePath));
            }
        }
    } catch (error) {
        console.log(`${colors.gray}Warning: Cannot access ${dir} - ${error.message}${colors.reset}`);
    }

    return files;
}

// Helper to safely delete file if it exists
async function deleteFileIfExists(filePath) {
    try {
        await fs.unlink(filePath);
        return true;
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
        return false;
    }
}

async function main() {
    try {
        const args = process.argv.slice(2);

        const positionalArgs = [];
        const rawIgnoreDirs = [];
        const rawIgnoreFiles = [];

        // --- ARGUMENT PARSER ---
        for (let i = 0; i < args.length; i++) {
            const arg = args[i];

            if (arg === "--ignore-dir" || arg === "-d") {
                const nextArg = args[i + 1];
                if (nextArg && !nextArg.startsWith("-")) {
                    rawIgnoreDirs.push(nextArg);
                    i++;
                } else {
                    console.error(`${colors.red}Error: -d flag requires a folder name/pattern.${colors.reset}`);
                    process.exit(1);
                }
            } else if (arg === "--ignore-file" || arg === "-f") {
                const nextArg = args[i + 1];
                if (nextArg && !nextArg.startsWith("-")) {
                    rawIgnoreFiles.push(nextArg);
                    i++;
                } else {
                    console.error(`${colors.red}Error: -f flag requires a file name/pattern.${colors.reset}`);
                    process.exit(1);
                }
            } else {
                positionalArgs.push(arg);
            }
        }

        if (positionalArgs.length < 1) {
            console.log("Usage:");
            console.log("  node files.js <sha1File> [targetDir] [options]");
            console.log("\nOptions:");
            console.log("  -d <pattern>   Ignore dir (e.g. 'config*', 'app/test*')");
            console.log("  -f <pattern>   Ignore file (e.g. '*.js', 'src/*.log')");
            process.exit(1);
        }

        const sha1File = positionalArgs[0];
        const targetDirArg = positionalArgs[1];

        const sha1FilePath = path.resolve(sha1File);
        const sha1Dir = path.dirname(sha1FilePath);
        const targetDir = targetDirArg ? path.resolve(targetDirArg) : sha1Dir;
        const parsed = path.parse(sha1FilePath);
        const sha1FileName = parsed.name;

        // --- PROCESS IGNORE RULES ---
        const dirs = processIgnoreList(rawIgnoreDirs, targetDir);
        const files = processIgnoreList(rawIgnoreFiles, targetDir);

        const ignoreRules = {
            dirNames: dirs.namePatterns,
            dirPaths: dirs.pathPatterns,
            fileNames: files.namePatterns,
            filePaths: files.pathPatterns,
        };

        const sha1Data = await fs.readFile(sha1FilePath, "utf8");
        const expectedFiles = sha1Data
            .split("\n")
            .filter((line) => line.trim().length >= 11)
            .map((line) => {
                const filePath = line.substring(11).trim();
                return normalizePath(filePath);
            });

        console.log(`${colors.cyan}SHA1 file:${colors.reset} ${sha1FilePath}`);
        console.log(`${colors.cyan}Target directory:${colors.reset} ${targetDir}`);

        // --- DISPLAY CONFIGURATION ---
        if (rawIgnoreDirs.length > 0) {
            console.log(`${colors.cyan}Ignoring Directories:${colors.reset}`);
            rawIgnoreDirs.forEach((p) => console.log(`  - ${p}`));
        }
        if (rawIgnoreFiles.length > 0) {
            console.log(`${colors.cyan}Ignoring Files:${colors.reset}`);
            rawIgnoreFiles.forEach((p) => console.log(`  - ${p}`));
        }

        console.log(`${colors.cyan}Expected files in SHA1:${colors.reset} ${expectedFiles.length}\n`);

        const actualFiles = await getFileList(targetDir, targetDir, ignoreRules);

        const expectedSet = new Set(expectedFiles);
        const actualSet = new Set(actualFiles);
        const missing = expectedFiles.filter((file) => !actualSet.has(file));
        const extra = actualFiles.filter((file) => !expectedSet.has(file));

        const missingFilePath = path.join(sha1Dir, `${sha1FileName}_missing_files.txt`);
        const extraFilePath = path.join(sha1Dir, `${sha1FileName}_extra_files.txt`);

        // --- REPORTS ---
        if (missing.length > 0) {
            await fs.writeFile(missingFilePath, missing.join("\n"));
            console.log(
                `${colors.yellow}- Missing: ${missing.length} (saved to ${path.basename(missingFilePath)})${
                    colors.reset
                }`
            );
        } else {
            const wasDeleted = await deleteFileIfExists(missingFilePath);
            console.log(`${colors.green}- Missing: 0${wasDeleted ? " (Old report deleted)" : ""}${colors.reset}`);
        }

        if (extra.length > 0) {
            await fs.writeFile(extraFilePath, extra.join("\n"));
            console.log(
                `${colors.yellow}- Extra: ${extra.length} (saved to ${path.basename(extraFilePath)})${colors.reset}`
            );
        } else {
            const wasDeleted = await deleteFileIfExists(extraFilePath);
            console.log(`${colors.green}- Extra: 0${wasDeleted ? " (Old report deleted)" : ""}${colors.reset}`);
        }

        console.log(`${colors.green}Comparison complete.${colors.reset}`);

        if (missing.length > 0) {
            console.log(`\n${colors.red}Sample missing:${colors.reset}`);
            missing.slice(0, 5).forEach((file) => console.log(`  ${file}`));
        }
        if (extra.length > 0) {
            console.log(`\n${colors.red}Sample extra:${colors.reset}`);
            extra.slice(0, 5).forEach((file) => console.log(`  ${file}`));
        }
    } catch (error) {
        console.error(`${colors.red}Error:${colors.reset}`, error.message);
        process.exit(1);
    }
}

main();
