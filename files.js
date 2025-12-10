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

async function getFileList(dir, baseDir, ignoreDirsSet, ignoreFilesSet) {
    let files = [];
    
    try {
        const items = await readdir(dir, { withFileTypes: true });

        for (const item of items) {
            const fullPath = path.join(dir, item.name);

            if (item.isDirectory()) {
                // CHECK IGNORE DIRECTORY (-d)
                if (ignoreDirsSet.has(item.name)) {
                    continue; 
                }
                
                files = files.concat(await getFileList(fullPath, baseDir, ignoreDirsSet, ignoreFilesSet));
            } else {
                // CHECK IGNORE FILE (-f)
                if (ignoreFilesSet.has(item.name)) {
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
        return true; // Deleted
    } catch (error) {
        // If error is anything other than "file not found", throw it
        if (error.code !== 'ENOENT') {
            throw error;
        }
        return false; // Did not exist
    }
}

async function main() {
    try {
        const args = process.argv.slice(2);
        
        const positionalArgs = []; 
        const ignoreDirs = [];     
        const ignoreFiles = [];

        // --- CUSTOM ARGUMENT PARSER ---
        for (let i = 0; i < args.length; i++) {
            const arg = args[i];

            // IGNORE DIRECTORY: -d or --ignore-dir
            if (arg === "--ignore-dir" || arg === "-d") {
                const nextArg = args[i + 1];
                if (nextArg && !nextArg.startsWith("-")) {
                    ignoreDirs.push(nextArg);
                    i++; 
                } else {
                    console.error(`${colors.red}Error: -d flag requires a folder name.${colors.reset}`);
                    process.exit(1);
                }
            } 
            // IGNORE FILE: -f or --ignore-file
            else if (arg === "--ignore-file" || arg === "-f") {
                const nextArg = args[i + 1];
                if (nextArg && !nextArg.startsWith("-")) {
                    ignoreFiles.push(nextArg);
                    i++; 
                } else {
                    console.error(`${colors.red}Error: -f flag requires a file name.${colors.reset}`);
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
            console.log("  -d, --ignore-dir <name>   Ignore a directory");
            console.log("  -f, --ignore-file <name>  Ignore a file");
            process.exit(1);
        }

        const sha1File = positionalArgs[0];
        const targetDirArg = positionalArgs[1];

        const sha1FilePath = path.resolve(sha1File);
        const sha1Dir = path.dirname(sha1FilePath);
        const targetDir = targetDirArg ? path.resolve(targetDirArg) : sha1Dir;
        const parsed = path.parse(sha1FilePath);
        const sha1FileName = parsed.name;

        // Create Sets
        const ignoreDirsSet = new Set(ignoreDirs);
        const ignoreFilesSet = new Set(ignoreFiles);

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

        if (ignoreDirsSet.size > 0) {
            console.log(`${colors.cyan}Ignoring Directories:${colors.reset}`);
            ignoreDirsSet.forEach(item => console.log(`  - ${item}`));
        }
        if (ignoreFilesSet.size > 0) {
            console.log(`${colors.cyan}Ignoring Files:${colors.reset}`);
            ignoreFilesSet.forEach(item => console.log(`  - ${item}`));
        }

        console.log(`${colors.cyan}Expected files in SHA1:${colors.reset} ${expectedFiles.length}\n`);

        const actualFiles = await getFileList(targetDir, targetDir, ignoreDirsSet, ignoreFilesSet);
        
        const expectedSet = new Set(expectedFiles);
        const actualSet = new Set(actualFiles);
        const missing = expectedFiles.filter((file) => !actualSet.has(file));
        const extra = actualFiles.filter((file) => !expectedSet.has(file));

        // Define paths for report files
        const missingFilePath = path.join(sha1Dir, `${sha1FileName}_missing_files.txt`);
        const extraFilePath = path.join(sha1Dir, `${sha1FileName}_extra_files.txt`);

        // --- HANDLE MISSING FILES REPORT ---
        if (missing.length > 0) {
            await fs.writeFile(missingFilePath, missing.join("\n"));
            console.log(`${colors.yellow}- Missing: ${missing.length} (saved to ${path.basename(missingFilePath)})${colors.reset}`);
        } else {
            // Cleanup: Delete file if it exists from previous run
            const wasDeleted = await deleteFileIfExists(missingFilePath);
            if (wasDeleted) {
                console.log(`${colors.green}- Missing: 0 (Old report file deleted)${colors.reset}`);
            } else {
                console.log(`${colors.green}- Missing: 0${colors.reset}`);
            }
        }

        // --- HANDLE EXTRA FILES REPORT ---
        if (extra.length > 0) {
            await fs.writeFile(extraFilePath, extra.join("\n"));
            console.log(`${colors.yellow}- Extra: ${extra.length} (saved to ${path.basename(extraFilePath)})${colors.reset}`);
        } else {
            // Cleanup: Delete file if it exists from previous run
            const wasDeleted = await deleteFileIfExists(extraFilePath);
            if (wasDeleted) {
                console.log(`${colors.green}- Extra: 0 (Old report file deleted)${colors.reset}`);
            } else {
                console.log(`${colors.green}- Extra: 0${colors.reset}`);
            }
        }

        console.log(`${colors.green}Comparison complete.${colors.reset}`);

        // Debug output samples
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