#### Install globally

```bash
# Install / Update
npm install -g git+https://github.com/MMiyako/verify-files.git
```

#### Usage

You must set a mode: `--files` | `-f` or `--checksum` | `-c`.

**Syntax:**
`verify <sha1_file> <target_directory> --mode`

```bash
# Verify checksum
verify list.sha1 ./project --checksum

# Compare files
verify list.sha1 ./project --files

# Compare files with exclusions (ignore node_modules folder and log files)
verify list.sha1 ./project --files -xd "node_modules" -xf "*.log"
```

---

#### Install locally

1. Copy the `__scripts` folder from this repository to your target folder.
2. Copy your SHA1 file into `__scripts` folder.

#### Usage

```bash
# Compare files
node files.js <your_sha1_file>

# Verify checksum
node checksum.js <your_sha1_file>
```
