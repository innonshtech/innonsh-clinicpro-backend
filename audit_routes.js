const fs = require('fs');
const path = require('path');

const apiDir = path.join(__dirname, 'src', 'app', 'api', 'v1');

const unprotectedRoutes = [];
const publicPrefixes = [
  '/auth', 
  '/clinic/register', 
  '/doctor/register',
  '/admin/auth'
];

function isPublic(routePath) {
  return publicPrefixes.some(prefix => routePath.includes(prefix));
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const fullPath = path.join(dir, f);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (f === 'route.js') {
      const content = fs.readFileSync(fullPath, 'utf8');
      const routeUrl = fullPath.split('v1')[1].replace(/\\/g, '/');
      
      // If it doesn't use withRoles and isn't a public endpoint
      if (!content.includes('withRoles') && !isPublic(routeUrl)) {
        unprotectedRoutes.push(routeUrl);
      }
    }
  }
}

walkDir(apiDir);
console.log("Unprotected Routes Found:");
console.log(unprotectedRoutes.join('\n') || "None");
