const fs = require('fs');
const path = require('path');

// Usage: node fix-filenames.js ./restored_radata
const targetDir = process.argv[2] || 'restored_radata';

if (!fs.existsSync(targetDir)) {
    console.error(`Directory not found: ${targetDir}`);
    process.exit(1);
}

const files = fs.readdirSync(targetDir);
let renamed = 0;

files.forEach(file => {
    // Check if it matches the "radata-KEY-HASH.tmp" pattern
    // Or just "radata-KEY"
    
    // Regex to match: radata-(CONTENT)-[hash].tmp
    // Hash is usually 3 chars? '6ol', '5sp'.
    const matchTmp = file.match(/^radata-(.+)-[a-z0-9]{3}\.tmp$/);
    
    if (matchTmp) {
        const key = matchTmp[1]; // The real key
        // Verify key isn't empty
        if (key) {
            console.log(`Recovering TMP: ${file} -> ${key}`);
            fs.renameSync(path.join(targetDir, file), path.join(targetDir, key));
            renamed++;
            return;
        }
    }
    
    // Check for non-tmp files that might have the prefix?
    // "radata-request_pulse..." (no .tmp)
    // Looking at your ls output:
    // radata-request_submissions%2Fa310...%1BartworkUrl-3rd.tmp
    // These are all .tmp.
    
    // What about the files that look okay?
    // request_pulse_...
    // These don't have radata- prefix. They are fine.
    
    // What about `!` ?
    // It exists. But `radata-!-6ol.tmp` also exists.
    // The .tmp one is likely newer (the crash state).
    // We should probably prefer the .tmp if it parses?
    // Or maybe the `!` file is the old valid one.
    
    // Strategy:
    // If we have `!` AND `radata-!-...tmp`, the tmp is a pending write.
    // If the system crashed, the write might be partial OR complete-but-not-renamed.
    // Safest bet: If `!` is empty/small, try the tmp.
    // But blindly overwriting might be risky.
    
    // However, if the user CANNOT login, the current `!` is likely bad or empty.
    // So recovering the tmp is the best shot.
});

console.log(`\nFixed ${renamed} files.`);
console.log("Please re-upload 'restored_radata' to the bucket.");
