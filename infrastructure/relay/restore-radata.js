const fs = require('fs');
const path = require('path');

// Usage: node restore-radata.js <source_folder>
const sourceDir = process.argv[2] || '.';
const destDir = path.join(process.cwd(), 'restored_radata');

if (!fs.existsSync(sourceDir)) {
    console.error(`Source directory not found: ${sourceDir}`);
    process.exit(1);
}

if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir);
}

console.log(`Analyzing ${sourceDir} -> Extracting to ${destDir}...`);

let copiedCount = 0;
let skippedCount = 0;

// Helper to check if a file is a Gun data file
function isGunFile(filename) {
    // Ignore common system/project files
    const ignoreExts = ['.js', '.ts', '.md', '.json', '.yml', '.yaml', '.html', '.css', '.lock', '.txt', '.xml'];
    const ignoreNames = ['package.json', 'package-lock.json', 'tsconfig.json', 'Dockerfile', 'LICENSE'];
    
    const ext = path.extname(filename).toLowerCase();
    
    // Explicitly ignore known non-data files
    if (ignoreNames.includes(filename)) return false;
    
    // Gun files usually have NO extension, or .json
    // But in your project root, you have code files.
    // If it's a .js/.ts/.tsx file, it's code.
    if (['.js', '.ts', '.tsx', '.jsx', '.html', '.css', '.yml', '.yaml', '.md'].includes(ext)) return false;

    // Gun data files often look like:
    // - key
    // - !key
    // - key.json
    // - radata (folder)
    
    return true;
}

// Special check for JSON content to be sure
function isValidGunData(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        if (!content.trim()) return false;
        
        // Gun data is usually JSON
        const json = JSON.parse(content);
        
        // Check for Gun graph structure keys (naive check)
        // Usually keys like '>' (metadata) or specific node structures
        // But simply being valid JSON + not a package.json is a strong signal if file ext is weird or missing.
        
        // Exclude package.json specifically by structure
        if (json.name && json.version && json.scripts) return false;
        if (json.compilerOptions) return false; // tsconfig
        
        return true;
    } catch (e) {
        return false;
    }
}

function scanAndCopy(currentDir, relativePath = '') {
    const items = fs.readdirSync(currentDir);

    for (const item of items) {
        const srcPath = path.join(currentDir, item);
        const stat = fs.statSync(srcPath);

        // Skip node_modules, .git, and the destination folder itself
        if (item === 'node_modules' || item === '.git' || item === '.vercel' || item === 'restored_radata') continue;
        if (item === 'frontend' || item === 'infrastructure') continue; // Skip source code folders

        if (stat.isDirectory()) {
            // Recurse? 
            // If we find a 'radata' folder inside, we definitely want that content.
            // If we are IN the root, and we see 'radata', dive in.
            if (item === 'radata') {
                console.log(`Found 'radata' folder. Flattening/Merging content...`);
                scanAndCopy(srcPath, ''); // Flatten: Don't create 'radata/radata'
            } else {
                // If it's some other folder (e.g. 'users'?), preserve structure?
                // Gun radisk usually creates flat files or 1 level.
                // Let's copy recursively maintaining structure if it looks like data folder.
                // But for safety, let's skip unknown folders unless they contain gun files.
                // Actually, simplest strategy: Scan EVERYTHING for JSON-like data that isn't code.
                // But avoid flattening if structure matters.
                
                // Strategy: Just flatten everything into destDir? 
                // No, key collisions.
                
                // Strategy: Mirror structure relative to 'radata' root.
                // If we are at root, and item is a file, copy to destDir.
                // If item is 'radata', recurse.
            }
        } else {
            // It's a file.
            if (isGunFile(item) && isValidGunData(srcPath)) {
                // It is a data file. Copy it.
                const destPath = path.join(destDir, item);
                fs.copyFileSync(srcPath, destPath);
                console.log(`[RESTORED] ${item}`);
                copiedCount++;
            } else {
                skippedCount++;
            }
        }
    }
}

// Run
scanAndCopy(sourceDir);

console.log('--- Restoration Complete ---');
console.log(`Restored Files: ${copiedCount}`);
console.log(`Skipped Files: ${skippedCount}`);
console.log(`\nLocation: ${destDir}`);
console.log(`\nNext Step: Upload contents of 'restored_radata' to your bucket's 'radata/' folder.`);
console.log(`Example: gcloud storage cp -r ./restored_radata/* gs://YOUR_BUCKET/radata/`);
