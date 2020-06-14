const BaseParser = require('./baseparser.js');

/*
This line is related to player messages:
[2020.06.14-16.54.45:302][733]LogExit: Exiting.
*/

class ExitParser extends BaseParser {
    parse(generator, line) {
        console.log('exit', generator, line)
        return generator === 'LogExit' && line === 'Exiting.';
    }
}

module.exports = ExitParser;