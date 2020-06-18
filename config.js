const yaml = require('js-yaml');
const path = require('path');
const fs = require('fs');

function loadConfig() {
  // check if config exists
  if (!fs.existsSync('brikkit.yaml')) {
    console.log('Missing brikkit.yaml config file');
    process.exit();
  }

  let config = yaml.safeLoad(fs.readFileSync('brikkit.yaml', 'utf8'));

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

  // filter out disabled servers
  config.servers = config.servers.filter(s => !s.disabled);
  config.reload = loadConfig;

  return config;
}

const config = loadConfig();

module.exports = config;