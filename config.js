const yaml = require('js-yaml');
const path = require('path');
const fs = require('fs');

// check if config exists
if (!fs.existsSync('brikkit.yaml')) {
  console.log('Missing brikkit.yaml config file');
  process.exit();
}

config = yaml.safeLoad(fs.readFileSync('brikkit.yaml', 'utf8'));

if (
  !config.credentials || !config.credentials.email || !config.credentials.password ||
  !config.servers || !config.servers.length
) {
  console.log('Error configuring brikkit. Missing credentials and servers');
  process.exit();
}

if (config.servers.some(s =>
  typeof s.port !== 'number'
)) {
  console.log('Unknown server definition');
  process.exit();
}

module.exports = config;