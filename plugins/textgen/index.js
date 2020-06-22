const documentation = {
  name: 'textgen',
  description: 'Generate text under your player',
  author: 'cake',
  commands: [{
    name: '!text',
    description: 'Generate some text in the world',
    example: '!text Hello, World!',
    args: [
      {name: 'text', description: 'text to generate', required: true},
    ],
  }, {
    name: '!text:color',
    description: '',
    example: '!text:color FF00FF',
    args: [
      {name: 'hexcolor', description: 'hex color (000000-FFFFFF) to assign to generated text', required: true},
    ],
  }]
};

const { sanitize } = require('../../util.js');
const PlayerPosProvider = require('../cakeutils/util.playerPos.js');
const fontParser = require('../cakeutils/util.fontParser.js');
const CooldownProvider = require('../cakeutils/util.cooldown.js');

const font = fontParser(__dirname  + '/font_default.brs');

module.exports = brikkit => {
  const deregister = [];
  const getPlayerPos = PlayerPosProvider(brikkit, deregister);
  const textColors = {};
  const cooldown = CooldownProvider(1000);

  deregister.push(brikkit.on('chat', evt => {
    const name = evt.getSender().getUsername();
    const [command, ...args] = evt.getContent().split(' ');

     // generate text
    if (command === '!text' && cooldown(name)) {
       getPlayerPos(name)
        .then(({x, y, z}) => {
          x = Math.floor(x)
          y = Math.floor(y)
          z = Math.floor(z)
          // generate text and write to save
          brikkit.writeSaveData('text_' + name, font.text(args.join(' '), {
            shift: [x, y, z - 27],
            color: textColors[name] || [0, 0, 0],
            author: {
              id: brikkit.getPlayerFromUsername(name).getUserId(),
              name,
            }
          }));
          brikkit.loadBricks('text_' + name);
        })
        .catch(e => {
          console.log(e);
          brikkit.say(`"Could not find ${sanitize(name)}"`)
        });
    }

    // set text generation color
    if (command === '!text:color' && cooldown(name)) {
      if(args[0].match(/^[0-9A-F]{6}$/i)) {
        textColors[name] = [parseInt(args[0].slice(0, 2), 16), parseInt(args[0].slice(2, 4), 16), parseInt(args[0].slice(4, 6), 16)];
        brikkit.say(`"Setting <b>${sanitize(name)}</> color to #<color=\\"${args[0]}\\">${args[0].toUpperCase()}</>"`);
      }
    }

  }));

  return {
    cleanup() {
      deregister.forEach(d => d());
    },
    documentation,
  };
};