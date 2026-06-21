const fs = require('fs');
const path = require('path');

const code = fs.readFileSync('index.backup.js', 'utf-8');

// We will split the file by searching for 'app.post(', 'app.get(', 'app.delete(', 'app.patch('
// and carefully balancing the braces {} to find the end of the route.

function extractRoutes() {
    let projectRoutes = [];
    let authRoutes = [];
    let deploymentRoutes = [];
    let analyticsRoutes = [];
    let githubRoutes = [];

    // Simple brute-force parser to find all app.VERB() calls
    const regex = /app\.(get|post|delete|patch)\s*\(\s*["']([^"']+)["']/g;
    let match;

    while ((match = regex.exec(code)) !== null) {
        const verb = match[1];
        const routePath = match[2];
        const startIndex = match.index;
        
        // Find matching closing parenthesis/brace
        let braceCount = 0;
        let parenCount = 0;
        let inString = false;
        let stringChar = null;
        let endIndex = -1;

        for (let i = startIndex; i < code.length; i++) {
            const char = code[i];
            
            // Handle strings
            if ((char === '"' || char === "'" || char === "`") && code[i-1] !== '\\') {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    inString = false;
                }
            }

            if (!inString) {
                if (char === '(') parenCount++;
                else if (char === ')') parenCount--;
                else if (char === '{') braceCount++;
                else if (char === '}') braceCount--;

                // If we've processed at least one paren/brace and both counts hit 0, we found the end
                // However, an app.get() might not use braces if it's just app.get('/', (req,res) => res.send('ok'));
                // but in this codebase, all routes have braces.
                // Actually, the route ends with `);`
                if (parenCount === 0 && braceCount === 0 && char === ';') {
                    endIndex = i;
                    break;
                }
            }
        }

        if (endIndex !== -1) {
            let routeCode = code.substring(startIndex, endIndex + 1);
            // Replace app. verb with router. verb
            routeCode = routeCode.replace(/^app\./, 'router.');

            if (routePath.startsWith('/auth')) authRoutes.push(routeCode);
            else if (routePath.startsWith('/project') || routePath.startsWith('/projects')) projectRoutes.push(routeCode);
            else if (routePath.startsWith('/deploy')) deploymentRoutes.push(routeCode);
            else if (routePath.startsWith('/analytics') || routePath.startsWith('/track')) analyticsRoutes.push(routeCode);
            else if (routePath.startsWith('/github')) githubRoutes.push(routeCode);
            else if (routePath.startsWith('/logs')) deploymentRoutes.push(routeCode);
            else if (routePath.startsWith('/resolve')) projectRoutes.push(routeCode); // resolve edge
            else if (routePath.startsWith('/internal')) deploymentRoutes.push(routeCode);
            else projectRoutes.push(routeCode); // fallback
        }
    }

    const header = `const express = require('express');\nconst { z } = require('zod');\nconst { prisma } = require('../../lib/prisma');\nconst { authMiddleware } = require('../middlewares/authMiddleware');\nconst { rateLimit } = require('../middlewares/rateLimitMiddleware');\nconst { encrypt, decrypt } = require('../../lib/crypto');\nconst crypto = require('crypto');\nconst dns = require('dns/promises');\nconst { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');\nconst bcrypt = require('bcryptjs');\nconst { ecsClient, CLUSTER, TASK, RunTaskCommand } = require('../services/awsService');\n\nconst router = express.Router();\n\n`;
    
    fs.writeFileSync('src/routes/authRoutes.js', header + authRoutes.join('\n\n') + '\n\nmodule.exports = router;');
    fs.writeFileSync('src/routes/projectRoutes.js', header + projectRoutes.join('\n\n') + '\n\nmodule.exports = router;');
    fs.writeFileSync('src/routes/deploymentRoutes.js', header + deploymentRoutes.join('\n\n') + '\n\nmodule.exports = router;');
    fs.writeFileSync('src/routes/analyticsRoutes.js', header + analyticsRoutes.join('\n\n') + '\n\nmodule.exports = router;');
    fs.writeFileSync('src/routes/githubRoutes.js', header + githubRoutes.join('\n\n') + '\n\nmodule.exports = router;');
    
    console.log("Routes extracted successfully!");
}

extractRoutes();
