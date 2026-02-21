const fs = require('fs');
const path = require('path');

// Usage: node fix-structure.js ./restored_radata
const targetDir = process.argv[2] || 'restored_radata';

if (!fs.existsSync(targetDir)) {
    console.error(`Directory not found: ${targetDir}`);
    process.exit(1);
}

const files = fs.readdirSync(targetDir);
let moved = 0;

files.forEach(file => {
    // Check for URL encoded slashes
    if (file.includes('%2F')) {
        const parts = file.split('%2F').map(decodeURIComponent);
        
        // Ensure we don't traverse up
        if (parts.some(p => p === '..' || p === '.')) return;

        // The last part is the filename, previous parts are folders
        const fileName = parts.pop();
        const folderPath = path.join(targetDir, ...parts);

        // Create directory structure
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }

        // Move file
        const oldPath = path.join(targetDir, file);
        const newPath = path.join(folderPath, fileName);
        
        // Handle collision (rare)
        if (!fs.existsSync(newPath)) {
            fs.renameSync(oldPath, newPath);
            moved++;
            console.log(`Structured: ${file} -> ${parts.join('/')}/${fileName}`);
        }
    }
});

console.log(`
Re-structured ${moved} files.`);
console.log("Please re-upload 'restored_radata' to the bucket.");
