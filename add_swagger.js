const fs = require('fs');
const path = require('path');

const apiDir = path.join(__dirname, 'src', 'app', 'api', 'v1');

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

// Support both `export const POST =` and `export async function GET(req)`
const methodRegex = /export\s+(?:async\s+)?(?:const|function)\s+(GET|POST|PUT|DELETE|PATCH)\b/g;

walkDir(apiDir, (filePath) => {
  if (!filePath.endsWith('route.js')) return;

  const content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('@swagger')) {
    console.log(`Skip (already has docs): ${filePath}`);
    return;
  }

  let newContent = content;
  let hasModifications = false;

  // Build the API URL Path
  const relPathArr = filePath.split(path.sep);
  const apiIndex = relPathArr.indexOf('api');
  if (apiIndex === -1) return;
  const routePathArr = relPathArr.slice(apiIndex, -1);
  let apiPath = '/' + routePathArr.join('/');
  
  // Swagger path parameters must use {id} instead of Next.js [id]
  apiPath = apiPath.replace(/\[([^\]]+)\]/g, '{$1}');

  const matches = [...content.matchAll(methodRegex)];
  
  if (matches.length > 0) {
    // Process in reverse to avoid index shifting when modifying the string
    matches.reverse().forEach(match => {
      const method = match[1].toLowerCase();
      // Group by the parent folder (e.g., 'patient', 'doctor')
      const tag = routePathArr[2] ? routePathArr[2].charAt(0).toUpperCase() + routePathArr[2].slice(1) : 'Default';
      
      // Determine if it needs parameters based on our `{id}` rewrite
      let paramsBlock = '';
      const paramsMatches = [...apiPath.matchAll(/\{([^}]+)\}/g)];
      if (paramsMatches.length > 0) {
        paramsBlock = `\n *     parameters:`;
        paramsMatches.forEach(pMatch => {
          paramsBlock += `\n *       - in: path\n *         name: ${pMatch[1]}\n *         required: true\n *         schema:\n *           type: string`;
        });
      }

      const swaggerBlock = `/**
 * @swagger
 * ${apiPath}:
 *   ${method}:
 *     summary: ${method.toUpperCase()} request for ${apiPath}
 *     tags: [${tag}]${paramsBlock}
 *     responses:
 *       200:
 *         description: Successful response
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Internal Server Error
 */
`;
      const insertIdx = match.index;
      newContent = newContent.slice(0, insertIdx) + swaggerBlock + newContent.slice(insertIdx);
      hasModifications = true;
    });
  }

  if (hasModifications) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`Added Swagger metadata to route: ${apiPath}`);
  }
});

console.log("Swagger Documentation generation complete.");
