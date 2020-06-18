/* Represents a brickadia server */

const fs = require('fs');
const readline = require('readline');
const { spawn, execSync } = require('child_process');

const BRICKADIA_FILENAME = 'Brickadia_Alpha4_Patch1_CL3642_Linux.tar.xz';
const BRICKADIA_URL = 'https://static.brickadia.com/builds/CL3642/' +
        BRICKADIA_FILENAME;

const DEFAULT_SERVER_NAME = 'Brikkit Server';
const DEFAULT_SERVER_DESC = 'Get Brikkit at https://github.com/n42k/brikkit';
const DEFAULT_SERVER_MAX_PLAYERS = 20;

class Brickadia {
    constructor(config, server, log) {
        this.config = config;
        this.server = server;
        this.log = log;

        // configuration paths
        const path = server.path;
        const brickadia = `brickadia/${path}/Brickadia`;
        this.PROGRAM_PATH = `${brickadia}/Binaries/Linux/BrickadiaServer-Linux-Shipping`;
        this.CONFIG_PATH = `${brickadia}/Saved/Config/LinuxServer`;
        this.SAVES_PATH = `${brickadia}/Saved/Builds`;
        this.SETTINGS_PATH = this.CONFIG_PATH + '/ServerSettings.ini';

        // download and unpack brickadia
        this._getBrickadiaIfNeeded();

        // update the config every time the server starts
        this._writeDefaultConfiguration(config, server);

        if(config.credentials.email === undefined ||
            config.credentials.password === undefined ||
            server.port === undefined) {
            throw new Error('Email or password are not set!');
        }

        // get user email and password, and server port based on env vars
        const userArg = `-User="${config.credentials.email}"`;
        const passwordArg = `-Password="${config.credentials.password}"`;
        const portArg = `-port="${server.port}"`;

        // start brickadia with aforementioned arguments
        // note that the unbuffer program is required,
        // otherwise the io will eventually stop
        this._spawn = spawn('unbuffer',
            ['-p', this.PROGRAM_PATH, 'BrickadiaServer',
                '-NotInstalled', '-log', userArg, passwordArg, portArg]);
        this._spawn.stdin.setEncoding('utf8');

        this._callbacks = {
            close: [],
            exit: [],
            out: [],
            err: []
        };

        this._spawn.on('close', code => {
            for(const callback of this._callbacks['close']) {
                try {
                    callback(code);
                } catch (e) {
                    this.log('brickadia close callback error', e)
                }
            }
        });

        this._spawn.on('exit', code => {
            for(const callback of this._callbacks['exit'])
                try {
                    callback(code);
                } catch (e) {
                    this.log('brickadia exit callback error', e)
                }
        });

        const errRl = readline.createInterface({
          input: this._spawn.stderr,
          terminal: false
        });

        errRl.on('line', line => {
            for(const callback of this._callbacks['err'])
                try {
                    callback(line);
                } catch (e) {
                    this.log('brickadia err callback error', e)
                }
        });

        const outRl = readline.createInterface({
          input: this._spawn.stdout,
          terminal: false
        });

        outRl.on('line', line => {
            for(const callback of this._callbacks['out']) {
                try {
                    callback(line);
                } catch (e) {
                    this.log('brickadia out callback error', e)
                }
            }
        });
    }

    /*
     * Types available:
     * 'close': on normal brickadia close
     *      args: code
     * 'exit': on abnormal brickadia termination
     *      args: code
     * 'out': on anything being written to stdout
     *      args: line
     * 'err': on anything being written to stderr
     *      args: line
     */
    on(type, callback) {
        if(this._callbacks[type] === undefined)
            throw new Error('Undefined Brickadia.on type.');

        this._callbacks[type].push(callback);
        return () => {
            this._callbacks[type].splice(this._callbacks[type].indexOf(callback, 1))
        };
    }

    write(line) {
        this._spawn.stdin.write(line);
    }

    _writeDefaultConfiguration(config, server) {
        execSync(`mkdir -p ${this.CONFIG_PATH}`);

        fs.writeFileSync(this.SETTINGS_PATH,
`[Server__BP_ServerSettings_General_C BP_ServerSettings_General_C]
MaxSelectedBricks=1000
MaxPlacedBricks=1000
SelectionTimeout=2.000000
PlaceTimeout=2.000000
ServerName=${server.name || DEFAULT_SERVER_NAME}
ServerDescription=${server.description || DEFAULT_SERVER_DESC}
ServerPassword=${server.password || ''}
MaxPlayers=${server.players || DEFAULT_SERVER_MAX_PLAYERS}
bPubliclyListed=True
WelcomeMessage="${server.welcome || '<color=\\"0055ff\\">Welcome to <b>{2}</>, {1}.</>'}"
bGlobalRulesetSelfDamage=True
bGlobalRulesetPhysicsDamage=False`);
    }

    // returns whether downloading brickadia was needed
    _getBrickadiaIfNeeded() {
        const path = this.server.path;
        if(fs.existsSync(`brickadia/${path}`) &&
            fs.existsSync(this.PROGRAM_PATH))
            return false;

        // only download brickadia if it doesn't exist
        if(!fs.existsSync(BRICKADIA_FILENAME)) {
            execSync(`rm -f ${BRICKADIA_FILENAME}`);
            execSync(`wget ${BRICKADIA_URL}`, {
                stdio: [null, process.stdout, process.stderr]});
            execSync(`rm -rf brickadia/${path}/*`);
        }

        // create folder if it does not exist
        if (!fs.existsSync('brickadia'))
            execSync(`mkdir -p brickadia`);

        // create the server folder
        if (!fs.existsSync(`brickadia/${path}`)) {
            execSync(`mkdir -p brickadia/${path}`);
            execSync(`pv ${BRICKADIA_FILENAME} | tar xJp -C brickadia/${this.server.path}`, {
                stdio: [null, process.stdout, process.stderr]});
            execSync(`mkdir -p ${this.SAVES_PATH}`);
        }
        return true;
    }
}

module.exports = Brickadia;
