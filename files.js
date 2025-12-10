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

function processIgnoreList(rawList, rootDir) {
    const names = new Set();
    const paths = new Set();

    rawList.forEach(item => {
        // specific check: if it contains separators, treat as path
        if (item.includes("/") || item.includes("\\")) {
            // Resolve to absolute path
            // If item is already absolute, path.resolve(root, item) returns item (on standard OS behavior)
            // If item is relative, it joins root + item
            const absPath = path.resolve(rootDir, item);
            paths.add(absPath);
        } else {
            // No separators, treat as a generic name to ignore everywhere
            names.add(item);
        }
    });

    return { names, paths };
}

async function getFileList(dir, baseDir, ignoreRules) {
    let files = [];
    
    try {
        const items = await readdir(dir, { withFileTypes: true });

        for (const item of items) {
            const fullPath = path.join(dir, item.name);

            if (item.isDirectory()) {
                // --- IGNORE DIRECTORY CHECKS ---
                
                // 1. Check by Name (e.g. "node_modules")
                if (ignoreRules.dirNames.has(item.name)) {
                    continue; 
                }

                // 2. Check by Specific Path (e.g. "C:\Project\node_modules")
                if (ignoreRules.dirPaths.has(fullPath)) {
                    continue;
                }
                
                // Recurse
                files = files.concat(await getFileList(fullPath, baseDir, ignoreRules));
            } else {
                // --- IGNORE FILE CHECKS ---

                // 1. Check by Name (e.g. ".DS_Store")
                if (ignoreRules.fileNames.has(item.name)) {
                    continue;
                }

                // 2. Check by Specific Path (e.g. "C:\Project\.DS_Store")
                if (ignoreRules.filePaths.has(fullPath)) {
                    continue;
                }

                const relativePath = path.relative(baseDir, fullPath);
                files.push(relativePath.replace(/\\/g, "/"));
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
        if (error.code !== 'ENOENT') throw error;
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
                    console.error(`${colors.red}Error: -d flag requires a folder name or path.${colors.reset}`);
                    process.exit(1);
                }
            } 
            else if (arg === "--ignore-file" || arg === "-f") {
                const nextArg = args[i + 1];
                if (nextArg && !nextArg.startsWith("-")) {
                    rawIgnoreFiles.push(nextArg);
                    i++; 
                } else {
                    console.error(`${colors.red}Error: -f flag requires a file name or path.${colors.reset}`);
                    process.exit(1);
                }
            } 
            else {
                positionalArgs.push(arg);
            }
        }

        if (positionalArgs.length < 1) {
            console.log("Usage:");
            console.log("  node files.js <sha1File> [targetDir] [options]");
            console.log("\nOptions:");
            console.log("  -d <name|path>   Ignore directory (e.g. 'config' or 'sql/config')");
            console.log("  -f <name|path>   Ignore file (e.g. '.env' or 'tests/setup.js')");
            process.exit(1);
        }

        const sha1File = positionalArgs[0];
        const targetDirArg = positionalArgs[1];

        const sha1FilePath = path.resolve(sha1File);
        const sha1Dir = path.dirname(sha1FilePath);
        // Default target dir is SHA1 file's dir if not provided
        const targetDir = targetDirArg ? path.resolve(targetDirArg) : sha1Dir;
        const parsed = path.parse(sha1FilePath);
        const sha1FileName = parsed.name;

        // --- PROCESS IGNORE RULES ---
        // We split the raw input into "Names" (match anywhere) and "Paths" (match exact location)
        const dirs = processIgnoreList(rawIgnoreDirs, targetDir);
        const files = processIgnoreList(rawIgnoreFiles, targetDir);

        const ignoreRules = {
            dirNames: dirs.names,
            dirPaths: dirs.paths,
            fileNames: files.names,
            filePaths: files.paths
        };

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

        // --- DISPLAY CONFIGURATION ---
        if (ignoreRules.dirNames.size > 0 || ignoreRules.dirPaths.size > 0) {
            console.log(`${colors.cyan}Ignoring Directories:${colors.reset}`);
            ignoreRules.dirNames.forEach(n => console.log(`  - [Name] ${n}`));
            ignoreRules.dirPaths.forEach(p => console.log(`  - [Path] ${path.relative(targetDir, p)}`));
        }
        if (ignoreRules.fileNames.size > 0 || ignoreRules.filePaths.size > 0) {
            console.log(`${colors.cyan}Ignoring Files:${colors.reset}`);
            ignoreRules.fileNames.forEach(n => console.log(`  - [Name] ${n}`));
            ignoreRules.filePaths.forEach(p => console.log(`  - [Path] ${path.relative(targetDir, p)}`));
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
            console.log(`${colors.yellow}- Missing: ${missing.length} (saved to ${path.basename(missingFilePath)})${colors.reset}`);
        } else {
            const wasDeleted = await deleteFileIfExists(missingFilePath);
            console.log(`${colors.green}- Missing: 0${wasDeleted ? " (Old report deleted)" : ""}${colors.reset}`);
        }

        if (extra.length > 0) {
            await fs.writeFile(extraFilePath, extra.join("\n"));
            console.log(`${colors.yellow}- Extra: ${extra.length} (saved to ${path.basename(extraFilePath)})${colors.reset}`);
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