const Parser = {};

Parser.JoinParser = require('./join.js');
Parser.ChatParser = require('./chat.js');
Parser.ExitParser = require('./exit.js');
Parser.PreStartParser = require('./prestart.js');
Parser.StartParser = require('./start.js');
Parser.MapChangeParser = require('./mapchange.js');

module.exports = Parser;