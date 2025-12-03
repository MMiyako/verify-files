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

async function getFileList(dir, baseDir, excludeDir) {
    let files = [];
    const items = await readdir(dir, { withFileTypes: true });

    for (const item of items) {
        const fullPath = path.join(dir, item.name);

        // Skip if this is the exclude directory
        if (path.resolve(fullPath) === path.resolve(excludeDir)) {
            continue;
        }

        if (item.isDirectory()) {
            files = files.concat(await getFileList(fullPath, baseDir, excludeDir));
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
        const sha1File = process.argv[2];
        const targetDirArg = process.argv[3]; // Optional second argument

        // Resolve SHA1 file path and get its directory
        const sha1FilePath = path.resolve(sha1File);
        const sha1Dir = path.dirname(sha1FilePath);

        // Determine target directory:
        // 1. Use the provided target directory if given
        // 2. Otherwise, use the SHA1 file's directory
        const targetDir = targetDirArg ? path.resolve(targetDirArg) : sha1Dir;

        const scriptDir = process.cwd();
        const parsed = path.parse(sha1FilePath);
        const sha1FileName = parsed.name;

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
        console.log(`${colors.cyan}Excluding directory:${colors.reset} ${scriptDir}`);
        console.log(`${colors.cyan}Expected files in SHA1:${colors.reset} ${expectedFiles.length}\n`);

        // Get actual files in target directory, excluding script directory
        const actualFiles = await getFileList(targetDir, targetDir, scriptDir);

        // Convert to Sets for efficient lookup
        const expectedSet = new Set(expectedFiles);
        const actualSet = new Set(actualFiles);

        // Identify missing and extra files
        const missing = expectedFiles.filter((file) => !actualSet.has(file));
        const extra = actualFiles.filter((file) => !expectedSet.has(file));

        // Save results
        const missingFile = `_files_missing_${sha1FileName}.txt`;
        const extraFile = `_files_extra_${sha1FileName}.txt`;

        await fs.writeFile(sha1Dir + "/" + missingFile, missing.join("\n"));
        await fs.writeFile(sha1Dir + "/" + extraFile, extra.join("\n"));

        console.log(`${colors.green}Comparison complete.${colors.reset}`);
        console.log(`${colors.yellow}- Missing files:${colors.reset} ${missing.length} (saved to ${missingFile})`);
        console.log(`${colors.yellow}- Extra files:${colors.reset} ${extra.length} (saved to ${extraFile})`);

        // Debug output
        if (missing.length > 0) {
            console.log(`\n${colors.red}Sample missing files:${colors.reset}`);
            missing.slice(0, 5).forEach((file) => console.log(`  ${file}`));
        }

        if (extra.length > 0) {
            console.log(`\n${colors.red}Sample extra files:${colors.reset}`);
            extra.slice(0, 5).forEach((file) => console.log(`  ${file}`));
        }
    } catch (error) {
        console.error(`${colors.red}Error:${colors.reset}`, error.message);
        process.exit(1);
    }
}

main();
