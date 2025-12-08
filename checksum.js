const fs = require("fs").promises;
const { createReadStream } = require("fs"); // Added for large file support
const path = require("path");
const { execSync } = require("child_process");
const { createHash } = require("crypto");

// "sha1sum" or "nodejs"
const method = "nodejs";

// Colors for terminal output
const colors = {
    reset: "\x1b[0m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    gray: "\x1b[90m",
};

async function calculateSHA1(filePath, method) {
    try {
        if (method === "sha1sum") {
            const output = execSync(`sha1sum "${filePath}"`, { encoding: "utf-8" });
            return output.trim().split(/\s+/)[0].substring(1, 11);
        } else {
            // Use streams instead of readFile to handle large files (>2GB)
            return new Promise((resolve, reject) => {
                const hash = createHash("sha1");
                const stream = createReadStream(filePath);

                stream.on("data", (chunk) => {
                    hash.update(chunk);
                });

                stream.on("end", () => {
                    // Match the original logic: hex digest, first 10 characters
                    resolve(hash.digest("hex").substring(0, 10));
                });

                stream.on("error", (err) => {
                    reject(err);
                });
            });
        }
    } catch (error) {
        console.error(`\n${colors.red}Error calculating hash for ${filePath}:${colors.reset}`, error.message);
        return null;
    }
}

function updateProgress(current, total, filename) {
    const percent = Math.floor((current / total) * 100);
    const progressBar = `[${"#".repeat(Math.floor(percent / 5))}${" ".repeat(20 - Math.floor(percent / 5))}]`;
    process.stdout.write(
        `\r${colors.cyan}Checking: ${colors.reset}${filename}\n` +
            `${colors.green}Progress: ${colors.reset}${progressBar} ${percent}% (${current}/${total})\x1b[K`
    );
}

async function main() {
    try {
        const sha1File = process.argv[2];
        const targetDirArg = process.argv[3]; // Optional second argument

        // Resolve SHA1 file path
        const sha1FilePath = path.resolve(sha1File);
        const sha1Dir = path.dirname(sha1FilePath);

        // Determine target directory:
        // 1. Use the provided target directory if given
        // 2. Otherwise, use the SHA1 file's directory
        const targetDir = targetDirArg ? path.resolve(targetDirArg) : sha1Dir;

        const parsed = path.parse(sha1FilePath);
        const sha1FileName = parsed.name;
        const failedChecksums = [];

        // Read and parse SHA1 file
        const sha1Data = await fs.readFile(sha1FilePath, "utf8");
        const entries = sha1Data
            .split("\n")
            .filter((line) => line.trim().length >= 11)
            .map((line) => ({
                expectedHash: line.substring(0, 10).toLowerCase(),
                filePath: line.substring(11).trim().replace(/\\/g, "/"),
            }));

        console.log(`${colors.cyan}SHA1 file:${colors.reset} ${sha1FilePath}`);
        console.log(`${colors.cyan}Target directory:${colors.reset} ${targetDir}`);
        console.log(`${colors.cyan}Verifying ${entries.length} files...${colors.reset}\n`);

        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const fullPath = path.join(targetDir, entry.filePath);

            updateProgress(i + 1, entries.length, entry.filePath);

            try {
                await fs.access(fullPath);
                const actualHash = await calculateSHA1(fullPath, method);

                if (!actualHash) {
                    failedChecksums.push(`${entry.filePath} (hash calculation failed)`);
                    continue;
                }

                const normalizedActual = actualHash.toLowerCase();
                const normalizedExpected = entry.expectedHash.toLowerCase();

                if (normalizedActual !== normalizedExpected) {
                    failedChecksums.push(`${entry.filePath} (expected ${normalizedExpected}, got ${normalizedActual})`);
                }
            } catch (error) {
                if (error.code === "ENOENT") {
                    failedChecksums.push(`${entry.filePath} (file not found)`);
                } else {
                    failedChecksums.push(`${entry.filePath} (error: ${error.message})`);
                }
            }
        }

        process.stdout.write("\r\x1b[K");
        await fs.writeFile(`_checksum_failed_${sha1FileName}.txt`, failedChecksums.join("\n"));

        console.log(`\n${colors.cyan}Verification complete.${colors.reset}`);
        console.log(
            `${failedChecksums.length ? colors.red : colors.green}Found ${failedChecksums.length} mismatches.${
                colors.reset
            }`
        );

        if (failedChecksums.length > 0) {
            console.log(`\n${colors.yellow}Sample mismatches:${colors.reset}`);
            console.log(failedChecksums.slice(0, 5).join("\n"));
            console.log(`${colors.gray}Full list saved to _checksum_failed_${sha1FileName}.txt${colors.reset}`);
        }
    } catch (error) {
        console.error(`\n${colors.red}Error:${colors.reset}`, error.message);
        process.exit(1);
    }
}

process.on("SIGINT", () => {
    console.log("\n\nVerification interrupted by user");
    process.exit(0);
});

main();
