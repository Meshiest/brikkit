const fs = require('fs');
const { execSync, spawn } = require('child_process');

const BrikkitServer = require('./brikkit.js');
const config = require('./config.js');
global.Brikkit = [];

const mkdir = d => fs.existsSync(d) || execSync(`mkdir ${d}`);
['logs', 'conf','saved','plugins'].forEach(mkdir);

const iso8601DateString = (new Date()).toISOString();

const kill = pid => spawn('kill', ['-9', pid]);

// remove colons from the date string; required for windows
const colonlessDateString = iso8601DateString.split(':').join('');

function createServer(server, i) {
    return new Promise(resolve => {
        const logFile = `logs/log_${i}_${colonlessDateString}.txt`;
        const stream = fs.createWriteStream(logFile, {flags:'a'});

        stream.on('error', err => {throw err});
        stream.on('open', fd => {
            const log = (...args) => {
                console.log(`[${i}]`, ...args);
                stream.write(`[${i}] ${args.join(' ')}\n`);
            }
            const brikkit = new BrikkitServer(config, server, log);
            brikkit.getPluginSystem().loadAllPlugins();
            brikkit._logFile = logFile;
            brikkit.on('exit', () => {
                console.log(`[${i}]`, 'closing brikkit');
                kill(brikkit._brickadia._spawn.pid);
            });
            resolve(brikkit);
        });

        function sleep(ms) {
          return new Promise(resolve => setTimeout(resolve, ms));
        }
    });
}

Promise.all(config.servers.map(createServer))
    .then(servers => {
        console.log('--- SERVERS LOADED ---');

        // kill all processes in the tree
        const cleanup = (clean, exit) => (code) => {
            servers.forEach(s => kill(s._brickadia._spawn.pid));
            if (exit) {
                console.log('Exiting');
                process.exit();
            }
        };

        process.on('exit', cleanup(true, false));
        process.on('SIGINT', cleanup(false, true));
        process.on('SIGUSR1', cleanup(false, true));
        process.on('SIGUSR2', cleanup(false, true));
        process.on('uncaughtException', err => {
            console.log(' --- SERVER END --- ');
            console.log(err.stack);

            servers.forEach(s => {
                fs.appendFileSync(s._logFile, err.stack);
                kill(s._brickadia._spawn.pid);
            });

            process.exit();
        });
    });

