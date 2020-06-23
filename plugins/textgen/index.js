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
    name: '!text:font',
    description: 'Select a font style',
    example: '!text:font large',
    args: [
      {name: 'font', description: 'selected font', required: true},
    ],
  }, {
    name: '!text:fonts',
    description: 'List available fonts',
    example: '!text:fonts',
    args: [],
  }, {
    name: '!text:color',
    description: '',
    example: '!text:color FF00FF',
    args: [
      {name: 'hexcolor', description: 'hex color (000000-FFFFFF) to assign to generated text', required: true},
    ],
  }]
};

const fs = require('fs');

const { sanitize } = require('../../util.js');
const PlayerPosProvider = require('../cakeutils/util.playerPos.js');
const fontParser = require('../cakeutils/util.fontParser.js');
const CooldownProvider = require('../cakeutils/util.cooldown.js');
const { linearRGB } = require('../cakeutils/util.color.js');

// load in saves in font_fontname.brs format
const fonts = Object.fromEntries(fs.readdirSync(__dirname)
  .map(f => f.match(/font_([a-z]+)\.brs/))
  .filter(f => f)
  .map(match => [match[1], fontParser(__dirname + '/' + match[0])]));

module.exports = brikkit => {
  const deregister = [];

  const getPlayerPos = PlayerPosProvider(brikkit, deregister);
  const cooldown = CooldownProvider(1000);

  global.textColors = global.textColors || {};
  global.textFonts = global.textFonts || {};

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
          brikkit.writeSaveData('text_' + name, fonts[global.textFonts[name] || 'default'].text(args.join(' '), {
            shift: [x, y, z - 27],
            color: global.textColors[name] || [0, 0, 0],
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
        global.textColors[name] = linearRGB([parseInt(args[0].slice(0, 2), 16), parseInt(args[0].slice(2, 4), 16), parseInt(args[0].slice(4, 6), 16)]);
        brikkit.say(`"Setting <b>${sanitize(name)}</> color to #<color=\\"${args[0]}\\">${args[0].toUpperCase()}</>"`);
      }
    }

    // set text generation font
    if (command === '!text:font' && cooldown(name)) {
      if(fonts[args[0]]) {
        global.textFonts[name] = args[0];
        brikkit.say(`"Setting <b>${sanitize(name)}</> font to <b>${args[0]}</>"`);
      }
    }

    // list available fonts
    if (command === '!text:fonts' && cooldown(name)) {
      brikkit.say(`"<b>Fonts</>: ${Object.keys(fonts).map(f => `<code>${f}</>`).join(', ')}"`);
    }
  }));

  return {
    cleanup() {
      deregister.forEach(d => d());
    },
    documentation,
  };
};