const fs = require("fs").promises;
const { createReadStream } = require("fs"); // Added for large file support
const path = require("path");
const { execSync } = require("child_process");
const { createHash } = require("crypto");

// "sha1sum" or "nodejs"
const method = "nodejs";

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
        if (process.argv.length < 3) {
            console.log("Usage: node checksum.js <sha1_file> [target_directory]");
            process.exit(1);
        }

        const sha1File = process.argv[2];
        const targetDirArg = process.argv[3];

        const sha1FilePath = path.resolve(sha1File);
        const sha1Dir = path.dirname(sha1FilePath);
        const targetDir = targetDirArg ? path.resolve(targetDirArg) : sha1Dir;

        const parsed = path.parse(sha1FilePath);
        const sha1FileName = parsed.name;

        const mismatches = [];
        const missingFiles = [];

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
                    mismatches.push(`${entry.filePath} (hash calculation failed)`);
                    continue;
                }

                const normalizedActual = actualHash.toLowerCase();
                const normalizedExpected = entry.expectedHash.toLowerCase();

                if (normalizedActual !== normalizedExpected) {
                    mismatches.push(`${entry.filePath} (expected ${normalizedExpected}, got ${normalizedActual})`);
                }
            } catch (error) {
                if (error.code === "ENOENT") {
                    missingFiles.push(entry.filePath);
                } else {
                    mismatches.push(`${entry.filePath} (error: ${error.message})`);
                }
            }
        }

        process.stdout.write("\r\x1b[K\r\x1b[1A\x1b[K"); // Clear progress

        const outputFilePath = path.join(sha1Dir, `${sha1FileName}_checksum_failed.txt`);
        const reportLines = [];

        if (mismatches.length > 0) {
            reportLines.push("=== HASH MISMATCHES / ERRORS ===");
            reportLines.push(...mismatches);
            reportLines.push(""); // Spacing
        }

        if (missingFiles.length > 0) {
            reportLines.push("=== MISSING FILES ===");
            reportLines.push(...missingFiles);
        }

        let fileActionMsg = "";

        if (reportLines.length > 0) {
            await fs.writeFile(outputFilePath, reportLines.join("\n"));
            fileActionMsg = `\n${colors.yellow}Full report saved to: ${outputFilePath}${colors.reset}`;
        } else {
            try {
                await fs.unlink(outputFilePath);
                // If we reach here, deletion was successful
                fileActionMsg = `\n${colors.yellow}[*] Deleted old report file: ${outputFilePath}${colors.reset}`;
            } catch (err) {
                // If error is ENOENT (File not found), we do nothing and print nothing
                if (err.code !== "ENOENT") {
                    throw err; // Throw other errors (permissions, etc)
                }
            }
        }

        console.log(`\n${colors.green}Verification complete${colors.reset}`);

        if (mismatches.length === 0 && missingFiles.length === 0) {
            console.log(`\n${colors.green}All checks passed. No errors found.${colors.reset}`);
        } else {
            if (mismatches.length > 0) {
                console.log(`\n${colors.red}[!] Found ${mismatches.length} hash mismatches${colors.reset}`);
                console.log(`${colors.gray}Sample mismatches:${colors.reset}`);
                // Use the raw array, NOT reportLines, to avoid printing headers
                console.log(mismatches.slice(0, 5).join("\n"));
                if (mismatches.length > 5) console.log("...");
            }

            if (missingFiles.length > 0) {
                console.log(`\n${colors.red}[!] Found ${missingFiles.length} missing files${colors.reset}`);
                console.log(`${colors.gray}Sample missing files:${colors.reset}`);
                // Use the raw array, NOT reportLines
                console.log(missingFiles.slice(0, 5).join("\n"));
                if (missingFiles.length > 5) console.log("...");
            }
        }

        // Print the file action message (Saved new file OR Deleted old file OR Nothing)
        if (fileActionMsg) {
            console.log(fileActionMsg);
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
