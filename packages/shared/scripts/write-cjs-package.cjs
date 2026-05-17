// Marks dist/cjs/ as CommonJS so Node.js doesn't treat .js files as ESM
// (needed because the parent package.json has "type": "module")
const fs = require('fs')
fs.writeFileSync('dist/cjs/package.json', JSON.stringify({ type: 'commonjs' }))
