const fs = require('fs');
const path = require('path');

function patchFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('Object.defineProperty(exports,')) return;
  
  content = content.replace(
    /Object\.defineProperty\(exports,/g,
    'if(typeof exports!=="undefined")Object.defineProperty(exports,'
  );
  fs.writeFileSync(filePath, content);
  console.log(`Patched: ${filePath}`);
}

function patchDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      patchDirectory(fullPath);
    } else if (fullPath.endsWith('.js') || fullPath.endsWith('.cjs')) {
      patchFile(fullPath);
    }
  }
}

// Patch all files in these directories recursively
patchDirectory(path.join('node_modules', '@aztec', 'bb.js', 'dest'));
patchDirectory(path.join('node_modules', '@noir-lang', 'noir_js', 'lib'));
patchDirectory(path.join('node_modules', '@noir-lang', 'acvm_js', 'nodejs'));
patchDirectory(path.join('node_modules', '@noir-lang', 'acvm_js', 'web'));
patchDirectory(path.join('node_modules', '@noir-lang', 'noirc_abi', 'lib'));

console.log('All done patching!');
