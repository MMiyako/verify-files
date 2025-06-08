const fs = require("fs").promises;
const path = require("path");
const { readdir } = require("fs").promises;

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
        const scriptDir = process.cwd();
        const parentDir = path.resolve(scriptDir, "..");

        // Read and parse SHA1 file
        const sha1Data = await fs.readFile(sha1File, "utf8");
        const expectedFiles = sha1Data
            .split("\n")
            .filter((line) => line.trim().length >= 11)
            .map((line) => {
                const filePath = line.substring(11).trim();
                return filePath.replace(/\\/g, "/");
            });

        // Get actual files in parent directory, excluding script directory
        const actualFiles = await getFileList(parentDir, parentDir, scriptDir);

        // Convert to Sets for efficient lookup
        const expectedSet = new Set(expectedFiles);
        const actualSet = new Set(actualFiles);

        // Identify missing and extra files
        const missing = expectedFiles.filter((file) => !actualSet.has(file));
        const extra = actualFiles.filter((file) => !expectedSet.has(file));

        // Save results
        await fs.writeFile("files_missing.txt", missing.join("\n"));
        await fs.writeFile("files_extra.txt", extra.join("\n"));

        console.log(`Comparison complete.\n- Missing files: ${missing.length} (saved to files_missing)\n- Extra files: ${extra.length} (saved to files_extra)`);

        // Debug output
        console.log("\nSample missing files:", missing.slice(0, 5));
        console.log("Sample extra files:", extra.slice(0, 5));
        console.log("\nScanning directory:", parentDir);
        console.log("Excluding directory:", scriptDir);
    } catch (error) {
        console.error("Error:", error.message);
        process.exit(1);
    }
}

main();
