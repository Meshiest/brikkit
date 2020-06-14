const fs = require('fs');
const { execSync } = require('child_process');

const BrikkitServer = require('./brikkit.js');
const config = require('./config.js');
global.Brikkit = [];

const mkdir = d => fs.existsSync(d) || execSync(`mkdir ${d}`);
['logs', 'conf','saved','plugins'].forEach(mkdir);

const iso8601DateString = (new Date()).toISOString();

// remove colons from the date string; required for windows
const colonlessDateString = iso8601DateString.split(':').join('');

function createServer(server, i) {
    const logFile = `logs/log_${i}_${colonlessDateString}.txt`;
    const stream = fs.createWriteStream(logFile, {flags:'a'});

    stream.on('error', err => {throw err});
    stream.on('open', fd => {
        const Brikkit = new BrikkitServer(config, server, stream);
        Brikkit.getPluginSystem().loadAllPlugins();
    });

    function sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    process.on('uncaughtException', err => {
        console.log(' --- SERVER END --- ');
        console.log(err.stack);

        fs.appendFileSync(logFile, err.stack);
        process.exit();
    });
}

config.servers.forEach(createServer);
