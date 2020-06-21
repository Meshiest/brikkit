const fs = require('fs');
const path = require('path');
const stripAnsi = require('strip-ansi');

const Brickadia = require('./brickadia.js');
const Terminal = require('./terminal.js');
const brs = require('brs-js');

const Parser = require('./parsers/parser.js');

const PluginSystem = require('./pluginsystem.js');
const Scraper = require('./scraper.js');

const Event = require('./events/event.js');

class Brikkit {
    constructor(config, server, log) {
        this.config = config;
        this.server = server;
        this.log = log;
        this.brs = brs;
        global.Brikkit.push(this);

        this._brickadia = new Brickadia(config, server, log);
        if(config.logging.dev)
            this._developmentMode();
        else {
            this._brickadia.on('out',
                line => log(`bout: "${line}"`));
            this._brickadia.on('err',
                line => log(`berr: "${line}"`));
        }

        // make an object entry for each type of event
        this._callbacks = {exit: []};
        for(const eventKey of Object.keys(Event)) {
            const eventConstructor = Event[eventKey];
            const getType = eventConstructor.prototype.getType;
            this._callbacks[getType()] = [];
        }

        this._playersByName = {};

        this._scraper = new Scraper();
        this._pluginSystem = new PluginSystem(this);

        this._brickadia.on('out', line => this._handleBrickadiaLine(line));
        this._brickadia.on('close', () => {
            this.log('Brickadia closed (probable crash)');
        });

        this._terminal = new Terminal();
        this._terminal.on('out', line => {
           const [cmd, ...args] = line.split(' ');

           if(cmd === 'cmd')
               this._brickadia.write(`${args.join(' ')}\n`);

           if(cmd === 'reload') {
                this.reloadPlugins();
           }
        });

        this.log(' --- STARTING BRIKKIT SERVER --- ');

        this.on('prestart', evt => {
            this._brickadia.write(`travel ${config.map}\n`);
        });

        this.on('start', evt => {
            this.log(' --- SERVER START --- ');
        });

        this._joinParser = new Parser.JoinParser();
        this._chatParser = new Parser.ChatParser();
        this._exitParser = new Parser.ExitParser();
        this._preStartParser = new Parser.PreStartParser();
        this._startParser = new Parser.StartParser();
        this._mapChangeParser = new Parser.MapChangeParser();
    }

    // reloads current plugins
    reloadPlugins() {
        try {
            // reload config
            this.config = this.config.reload();
            // update server config based on shared port
            this.server = this.config.servers.find(s => s.port === this.server.port);

            // server is now disabled
            if (!this.server) {
                this._brickadia.write('exit\n');
                return;
            }

            this.log('Reloading plugins...')
            this.debugSay('Reloading plugins...');
            const loadedPlugins = this._pluginSystem.loadAllPlugins();
            this.log(`Loaded ${loadedPlugins.length} plugins`);
            this.debugSay(`Loaded <color=\\"ffff00\\">${loadedPlugins.length}</> plugins.`);
        } catch (e) {
            this.log('Error reloading plugins', e)
            this.debugSay('Error reloading plugins');
        }
    }

    // show helptext
    showHelp(message) {
        const [_, ...args] = message.split(' ');

        // available commands and documentation from the plugin system
        const commands = this._pluginSystem.commands;
        const docs = this._pluginSystem.documentation;

        // no arguments
        if (!args.length) {
            this.say(`"Use <code>!help plugin</> or <code>!help !command</> for more information"`)
            this.say(`"Installed Plugins: ${
                Object.keys(docs).map(d => `<color=\\"c4d7f5\\">${d}</>`).join(', ')
            }"`)

        // plugin or command argument
        } else if (args.length === 1) {
            // argument is a plugin; render description, author, and commands
            if (docs[args[0]]) {
                const doc = docs[args[0]];
                const desc = doc.description || 'no description';
                this.say(`"<b>Plugin</> <code>${args[0]}</>: ${desc}"`);

                if (doc.author)
                    this.say(`"<b>Author</>: <color=\\"c4d7f5\\"><b>${doc.author}</></>"`);

                if (doc.commands && doc.commands.length > 0)
                    this.say(`"<b>Commands</>: ${doc.commands.map(c => `<code>${c.name}</>`).join(', ')}"`);

            // argument is a command
            } else if (commands[args[0]]) {
                const doc = commands[args[0]];
                const desc = doc.description || 'no description';
                const example = doc.example || 'no example';
                this.say(`"<b>Command</> <code>${doc.name}</>: ${desc}"`);
                this.say(`"<b>Example</>: <code>${example}</>"`);
                if (doc.args && doc.args.length > 0) {
                    this.say(`"<b>Arguments</>:"`);
                    for (const arg of doc.args) {
                        const desc = arg.description || 'no description';
                        this.say(`"- <code>${arg.name}</>${arg.required ? ' (required)' : ''}: ${desc}"`);
                    }
                } else {
                    this.say(`"<b>Arguments</>: None"`);
                }


            // argument is not found
            } else {
                this.say(`"Could not find that command or plugin"`);
            }

        // too many arguments
        } else {
            this.say(`"Use <code>!help</> to list plugins and <code>!help plugin</> or <code>!help !command</> for more information"`);
        }
    }

    /*
     * Types available:
     * 'chat': when someone sends a chat message
     *      args: (message)
     *      message: {
     *          username: "n42k",
     *          content: "Hello World!"
     *      }
     */
    on(type, callback) {
        if(this._callbacks[type] === undefined)
            throw new Error('Undefined Brikkit.on type.');

        this._callbacks[type].push(callback);
        return () => {
            this._callbacks[type].splice(this._callbacks[type].indexOf(callback, 1));
        }
    }

    getPlayerFromUsername(username) {
        const player = this._playersByName[username];
        return player === undefined ? null : player;
    }

    say(message) {
        const messages = message.split('\n');

        for(const msg of messages)
            this._brickadia.write(`Chat.Broadcast ${msg}\n`);
    }

    debugSay(...args) {
        const msg = `"[<color=\\"c4d7f5\\">BRIKKIT</>]: ${args.join(' ')}"`;
    }

    saveBricks(saveName) {
        this._brickadia.write(`Bricks.Save ${saveName}\n`);
    }

    loadBricks(saveName) {
        this._brickadia.write(`Bricks.Load ${saveName}\n`);
    }

    getSaves(callback) {
        fs.readdir('brickadia/Brickadia/Saved/Builds/', {}, (err, files) => {
            if(err)
                throw err;

            const filesWithoutExtension = files.map(file => file.slice(0, -4));

            callback(filesWithoutExtension);
        });
    }

    // open a save file if it exists, returns null on error
    readSaveData(s) {
        const file = this.savePath(s);
        if (!file)
            return null;
        try {
            return brs.read(fs.readFileSync(file));
        } catch (e) {
            return null;
        }
    }

    // write saveData to a file, returns false on error
    writeSaveData(name, data) {
        const file = path.join(this._brickadia.SAVES_PATH, name + '.brs');
        try {
            fs.writeFileSync(file, new Uint8Array(brs.write(data)));
            return true;
        } catch (e) {
            return false;
        }
    }

    // get path to a save file
    savePath(s) {
        const file = path.join(this._brickadia.SAVES_PATH, s + '.brs');
        return fs.existsSync(file) ? file : null;
    }

    // DANGER: clears all bricks in the server
    clearAllBricks() {
        this._brickadia.write(`Bricks.ClearAll\n`);
    }

    // this disconnects all players.
    changeMap(mapName) {
        if(['Studio_Night',
            'Studio_Day',
            'Studio',
            'Plate',
            'Peaks'].indexOf(mapName) === -1)
            return;

        this._brickadia.write(`travel ${mapName}\n`);
    }

    getScraper() {
        return this._scraper;
    }

    getPluginSystem() {
        return this._pluginSystem;
    }

    // adds callbacks to print out stdout and stderr directly from Brickadia
    _developmentMode() {
        this._brickadia.on('out', line => this.log(`bout: "${line}"`));
        this._brickadia.on('err', line => this.log(`berr: "${line}"`));
    }

    _handleBrickadiaLine(line) {
        line = stripAnsi(line);

        const matches = /^\[(.*?)\]\[.*?\](.*?): (.*)$/.exec(line);

        if(matches === undefined || matches === null)
            return;

        const dateString = matches[1]
            .replace(':', '.')
            .replace('-', 'T')
            .replace('.', '-')
            .replace('.', '-')
            .replace('.', ':')
            .replace('.', ':');

        const date = new Date(dateString + 'Z');

        // which object generated the message
        // UE4 specific: LogConfig, LogInit, ...
        // useful for understanding the line
        const generator = matches[2];

        const restOfLine = matches[3];

        const joinedPlayer = this._joinParser.parse(generator, restOfLine);
        if(joinedPlayer !== null) {
            this._addPlayer(joinedPlayer);
            this._putEvent(new Event.JoinEvent(date, joinedPlayer));
        }

        const chatParserResult = this._chatParser.parse(generator, restOfLine);
        if(chatParserResult !== null) {
            const [username, message] = chatParserResult;
            const player = this.getPlayerFromUsername(username);

            // this is the only builtin command, helptext
            if (message.startsWith('!help') && !this._disableHelp) {
                this.showHelp(message);
            } else {
                this._putEvent(new Event.ChatEvent(date, player, message));
            }

        }

        const exitParserResult = this._exitParser.parse(generator, restOfLine);
        if(exitParserResult) {
            this._putEvent({getType(){return 'exit'}, getDate(){return date;}});
        }

        const serverPreStarted =
            this._preStartParser.parse(generator, restOfLine);
        if(serverPreStarted)
            this._putEvent(new Event.PreStartEvent(date));

        const serverStarted = this._startParser.parse(generator, restOfLine);
        if(serverStarted)
            this._putEvent(new Event.StartEvent(date));

        const mapChanged = this._mapChangeParser.parse(generator, restOfLine);
        if(mapChanged)
            this._putEvent(new Event.MapChangeEvent(date));
    }

    _putEvent(event) {
        for(const callback of this._callbacks[event.getType()]) {
            try {
                callback(event);
            } catch (err) {
                this.log('Error in callback', err);
            }
        }
    }

    _addPlayer(player) {
        this._playersByName[player.getUsername()] = player;
    }
}

module.exports = Brikkit;