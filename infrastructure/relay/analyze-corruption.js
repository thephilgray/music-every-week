const fs = require('fs');
const path = require('path');

// Usage: node analyze-corruption.js ./path/to/radata
const targetPath = process.argv[2] || 'radata';

if (!fs.existsSync(targetPath)) {
    console.error(`Error: Path not found at ${targetPath}`);
    console.log('Usage: node analyze-corruption.js <path-to-radata-folder>');
    process.exit(1);
}

console.log(`Scanning ${targetPath}...`);

let totalFiles = 0;
let corruptedFiles = 0;
let totalNodes = 0;

function scanDir(dir) {
    const items = fs.readdirSync(dir);

    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            scanDir(fullPath);
        } else {
            totalFiles++;
            analyzeFile(fullPath);
        }
    }
}

function analyzeFile(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        if (!raw.trim()) return; // Empty file is fine/ignore

        let data;
        try {
            data = JSON.parse(raw);
        } catch (e) {
            console.error(`[CRITICAL] JSON Parse Failed: ${filePath}`);
            corruptedFiles++;
            return;
        }

        // Radisk files usually contain a partial graph
        for (const key in data) {
            totalNodes++;
            const val = data[key];

            // Check 1: Keys must be strings (JSON guarantees this, but check logic)
            if (key === 'true' || key === 'false' || key === 'null' || key === 'undefined') {
                console.warn(`[SUSPICIOUS KEY] File: ${filePath} -> Key: "${key}"`);
            }

            // Check 2: Value consistency
            if (typeof val === 'object' && val !== null) {
                // If it's a node, check metadata
                // ...
            } else {
                // Primitive value in root? Gun usually stores { soul: { ... } }
                // But Radisk splits keys. 
                // If we see raw numbers/bools where objects are expected, that's the "radix error" source.
            }
        }

    } catch (err) {
        console.error(`Error reading ${filePath}:`, err);
    }
}

try {
    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
        scanDir(targetPath);
    } else {
        totalFiles++;
        analyzeFile(targetPath);
    }

    console.log('--- Analysis Complete ---');
    console.log(`Scanned Files: ${totalFiles}`);
    console.log(`Nodes Checked: ${totalNodes}`);
    console.log(`Corrupted Files: ${corruptedFiles}`);

    if (corruptedFiles === 0) {
        console.log("\nGood news: No obvious JSON corruption found.");
        console.log("The issue might be logical (e.g. data missing) rather than physical.");
    } else {
        console.log("\nBAD NEWS: Files are physically corrupted.");
        console.log("If you have a backup, use it. Otherwise, you must delete the corrupted files.");
    }

} catch (e) {
    console.error("Script failed:", e);
}