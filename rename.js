const fs = require('fs');
const path = require('path');

const EXCLUDES = ['node_modules', '.git', 'dist', 'drizzle', 'build', '.kilo', '.gemini'];
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md'];

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      const basename = path.basename(file);
      if (!EXCLUDES.includes(basename)) {
        results = results.concat(walk(file));
      }
    } else {
      if (EXTENSIONS.includes(path.extname(file))) {
        // Exclude migration and snapshot files
        if (!file.includes(path.join('drizzle', 'meta')) && !file.endsWith('.sql') && !file.includes('drizzle') && !file.includes('package-lock.json')) {
          results.push(file);
        }
      }
    }
  });
  return results;
}

const files = walk(__dirname);

let changedFiles = 0;
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  let newContent = content.replace(/ngo_admin/g, 'admin');
  newContent = newContent.replace(/event_admin/g, 'event_manager');
  
  if (content !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8');
    console.log(`Updated ${file}`);
    changedFiles++;
  }
}
console.log(`Changed ${changedFiles} files.`);
