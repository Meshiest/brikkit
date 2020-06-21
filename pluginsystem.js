const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const disrequire = require('disrequire');

const tmp = require('tmp');
tmp.setGracefulCleanup();

class PluginSystem {
    constructor(brikkit) {
        this.brikkit = brikkit;
        this._plugins = {};
        this.documentation = {};
        this.commands = {};
    }

    getAvailablePlugins() {
        return fs.readdirSync('plugins');
    }

    loadPlugin(plugin) {
        return plugin.endsWith('zip') ? this._loadPluginZip(plugin) : this._loadPluginDirectory(plugin);
    }

    // generate documentation from loaded plugins
    buildDocumentation() {
        this.documentation = {};
        this.commands = {};
        for (const plugin of this.loadedPlugins) {
            if (!plugin.documentation)
                continue;

            // add the documentation into a dictionary
            this.documentation[plugin.documentation.name] = plugin.documentation;

            // add all the commands into a dictionary
            if (plugin.documentation.commands)
                for (const cmd of plugin.documentation.commands)
                    this.commands[cmd.name] = cmd;
        }
    }

    loadAllPlugins() {
        if (this.loadedPlugins && this.loadedPlugins.length > 0) {
            for(const plugin of this.loadedPlugins) {
                if (plugin.cleanup) {
                    try {
                        plugin.cleanup();
                    } catch (e) {
                        this.brikkit.log('plugin loader (cleanup):', e);
                    }
                }
            }
        }

        const pluginPaths = this.getAvailablePlugins()
            // only find plugins with index.js files
            .map(plugin => path.parse(plugin));

        // if 2 plugins have the same name (/example/ and /example.zip),
        // let's give priority to the ones that are in a directory
        // for this, we create a mapping of a bare plugin name (example)
        // and the best [that we found so far] filename
        const pluginNameMap = {};

        pluginPaths.forEach(plugin => {
            if(plugin.name in pluginNameMap) {
                // if the plugin is already in the map, we gotta compare them
                const otherPlugin = pluginNameMap[plugin.name];

                // if the other plugin is a zip, the current plugin is
                // a directory, thus we prefer it to the other
                if(otherPlugin.ext === 'zip')
                    pluginNameMap[plugin.name] = plugin;
                else // otherwise we prefer the other plugin
                    pluginNameMap[plugin.name] = otherPlugin;
            } else // if the plugin isn't in the mapping, simply add it
                pluginNameMap[plugin.name] = plugin;
        });

        // store loaded plugins
        this.loadedPlugins = Object.values(pluginNameMap)
            // check if this server has this plugin configured or include all of them
            .filter(plugin => !this.brikkit.server.plugins || this.brikkit.server.plugins.includes(plugin.name))
            // load the plugin
            .map(pluginPath => this.loadPlugin(pluginPath.base))
            // filter all errored plugins
            .filter(p => p);

        this.buildDocumentation();

        return this.loadedPlugins;
    }

    _loadPluginZip(plugin) {
        const path = tmp.dirSync().name;
        execSync(`unzip ./plugins/${plugin} -d ${path}`);

        try { disrequire(`${path}/index.js`); } catch (e) { }

        try {
            return require(`${path}/index.js`)(this.brikkit);
        } catch (e) {
            this.brikkit.log(`plugin loader (loading ${plugin}):`, e);
        }
    }

    _loadPluginDirectory(plugin) {
        try { disrequire(`${process.cwd()}/plugins/${plugin}/index.js`); } catch (e) { }

        try {
            return require(`${process.cwd()}/plugins/${plugin}/index.js`)(this.brikkit);
        } catch (e) {
            this.brikkit.log(`plugin loader (loading ${plugin}):`, e);
        }
    }
}

module.exports = PluginSystem;