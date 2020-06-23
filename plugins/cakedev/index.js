const documentation = {
  name: 'cakedev',
  description: 'cake\'s debug plugin for writing new plugins',
  author: 'cake',
  commands: [{
    name: '!origin',
    description: '(debug) Places a single 1x1f brick at (0, 0, 0)',
    example: '!origin',
    args: [],
  }, {
    name: '!find',
    description: '(debug) Displays position of the activating player',
    example: '!find',
    args: [],
  }, {
    name: '!brick',
    description: '(debug) Places a bring under the activating player',
    example: '!brick',
    args: [],
  }, {
    name: '!colorwheel',
    description: '(debug) Render 3 sRGB and 3 LinearRGB color wheels',
    example: '!colorwheel',
    args: [],
  }, {
    name: '!parse',
    description: '(debug) Reads the entire save into brs-js and displays player position and brick count',
    example: '!parse',
    args: [],
  }, {
    name: '!authorize',
    description: 'Authorizes a player to use the !cage and !trap commands, only configured users can use this',
    example: '!authorize Sixmorphugus',
    args: [],
  }, {
    name: '!cage',
    description: 'Trap the activating player in a cage',
    example: '!cage',
    args: [],
  }, {
    name: '!trap',
    description: '',
    example: '!trap Wrapperup',
    args: [
      {name: 'target', description: 'Player to trap', required: true},
      {name: 'please', description: 'The word \\"please\\" to make the bricks public', required: false},
    ],
  }]
};

const brs = require('brs-js');
const fs = require('fs');
const { sanitize } = require('../../util.js');
// try{require('disrequire')('./util.tool.js');}catch(e){console.log(e)}
const { moveBricks, studs, ParseTool, WriteTool } = require('../cakeutils/util.tool.js');
const PlayerPosProvider = require('../cakeutils/util.playerPos.js');
const SaveParseProvider = require('../cakeutils/util.saveParse.js');
const CooldownProvider = require('../cakeutils/util.cooldown.js');
const { hsv, linearRGB } = require('../cakeutils/util.color.js');

const cage = brs.read(fs.readFileSync(__dirname  + '/cage.brs'));

const author = {
  id: '64f876ca-d34a-4468-a755-7be03c722944',
  name: 'Gen',
};

const createBrick = (x, y, z) => ({
  author,
  description: 'generate test',
  brick_owners: [author],
  brick_assets: ['PB_DefaultTile', 'PB_DefaultBrick'],
  bricks: [{
    asset_name_index: 1,
    color: [255, 255, 255, 255],
    size: [5, 5, 2],
    position: [Math.round(x), Math.round(y), Math.round(z)],
    rotation: 0,
    visibility: true,
    collision: true,
    direction: 4,
  }],
});

const createBricks = arr => ({
  author,
  description: 'generate test',
  brick_owners: [author],
  brick_assets: ['PB_DefaultTile', 'PB_DefaultBrick'],
  bricks: arr.map(({pos: [x, y, z], color=[255,255,255,255]}) => ({
    asset_name_index: 1,
    size: [5, 5, 2],
    position: [Math.round(x), Math.round(y), Math.round(z)],
    color,
    rotation: 0,
    visibility: true,
    collision: true,
    direction: 4,
  })),
});

const createCage = (author, {x, y, z}) => ({
  author,
  description: 'generate test',
  brick_owners: [author],
  brick_assets: cage.brick_assets,
  materials: cage.materials,
  colors: cage.colors,
  bricks: moveBricks(cage.bricks, [x, y, z]),
});

module.exports = brikkit => {
  const write = str => brikkit._brickadia.write(str + '\n');
  const deregister = [];

  global.authorized = global.authorized || [];

  const getPlayerPos = PlayerPosProvider(brikkit, deregister);
  const saveAndParse = SaveParseProvider(brikkit);
  const cooldown = CooldownProvider(1000);

  deregister.push(brikkit.on('chat', evt => {
    const name = evt.getSender().getUsername();
    const [command, ...args] = evt.getContent().split(' ');

    const auth = (name === 'cake' || global.authorized.includes(name));

    if (command === '!origin' && cooldown(name) && auth) {
      brikkit.writeSaveData('brick', createBrick(0, 0, 0));
      brikkit.loadBricks('brick');
    }

    if (command === '!parse' && name === 'cake' && cooldown(name)) {
        Promise.all([saveAndParse('parsed'), getPlayerPos(name)])
        .catch(() => brikkit.say(`"Could load data or get pos"`))
        .then(([save, {x, y, z}]) => {
          if (save) {
            brikkit.say(`"Found ${save.bricks.length} bricks, player @ &lt;${x}, ${y}, ${z}&gt;"`);
          }
        });
    }

    if (command === '!find' && cooldown(name) && auth) {
      getPlayerPos(name)
        .then(({x, y, z}) => {
          brikkit.say(`"Found ${name} @ &lt;${x}, ${y}, ${z}&gt;"`);
        })
        .catch(() => brikkit.say(`"Could not find ${sanitize(name)}"`));

    }
    if (command === '!brick' && cooldown(name) && auth) {
      getPlayerPos(name)
        .then(({x, y, z}) => {
          brikkit.writeSaveData('brick_' + name, createBrick(x, y, z - 30));
          brikkit.loadBricks('brick_' + name);
        })
        .catch(() => brikkit.say(`"Could not find ${sanitize(name)}"`));
    }

    if (command === '!colorwheel' && cooldown(name) && auth) {
      getPlayerPos(name)
        .then(({x, y, z}) => {
          const size = 128;
          const bricks = [];

          for (let i = 0; i < size; i++)
            for (let j = 0; j < size; j++) {
              const value = Math.hypot(i - size/2, j - size/2)/(size/2);
              const hue = (Math.atan2(j - size/2, i - size/2) + Math.PI)/Math.PI/2;
              if (value <= 1) {
                bricks.push({
                  pos: [x + (i - size/2)*10, y + (j - size/2) * 10, z - 24],
                  color: [...hsv(hue, value, 1), 255],
                });
                bricks.push({
                  pos: [x + (i - size/2)*10, y + (j + size - size/2) * 10, z - 24],
                  color: [...linearRGB(hsv(hue, value, 1)), 255],
                });
               bricks.push({
                  pos: [x + (i + size - size/2)*10, y + (j - size/2) * 10, z - 24],
                  color: [...hsv(hue, 1, value), 255],
                });
                bricks.push({
                  pos: [x + (i + size - size/2)*10, y + (j + size - size/2) * 10, z - 24],
                  color: [...linearRGB(hsv(hue, 1, value)), 255],
                });
                bricks.push({
                  pos: [x + (i + size * 2 - size/2)*10, y + (j - size/2) * 10, z - 24],
                  color: [...hsv(hue, value, value), 255],
                });
                bricks.push({
                  pos: [x + (i + size * 2 - size/2)*10, y + (j + size - size/2) * 10, z - 24],
                  color: [...linearRGB(hsv(hue, value, value)), 255],
                });
              }
            }

          try {
            brs.write(createBricks(bricks));
          } catch (e) {
            console.error(e);
          }
          brikkit.writeSaveData('color_' + name, createBricks(bricks));
          // brikkit.writeSaveData('color_' + name, createBrick(x, y, z));
          brikkit.loadBricks('color_' + name);
        })
        .catch(() => brikkit.say(`"Could not find ${sanitize(name)}"`));
    }

    if (command === '!cage' && cooldown(name) && auth) {
      getPlayerPos(name)
        .then(({x, y, z}) => {
          x = Math.round(x);
          y = Math.round(y);
          z = Math.round(z);
          brikkit.writeSaveData('cage_' + name, createCage(author, {x, y, z: z - 38}));
          brikkit.loadBricks('cage_' + name);
        })
        .catch(() => brikkit.say(`"Could not find ${sanitize(name)}"`));
    }

    if (command === '!trap' && cooldown(name) && args[0] && auth) {
      getPlayerPos(args[0])
        .then(({x, y, z}) => {
          x = Math.round(x);
          y = Math.round(y);
          z = Math.round(z);
          try {
            brikkit.writeSaveData('cage_' + args[0], createCage(args[1] === 'please' ? author : {
              id: brikkit.getPlayerFromUsername(args[0]).getUserId(),
              name: args[0],
            }, {x, y, z: z - 38}));
            brikkit.loadBricks('cage_' + args[0]);
          } catch (e) {
            console.log(e);
          }
        })
        .catch(() => brikkit.say(`"Could not find ${sanitize(args[0])}"`));
    }

    if (command === '!authorize' && name === 'cake' && args[0]) {
      console.log(global.authorized);
      if (!brikkit.getPlayerFromUsername(args[0]))
        return;
      if (global.authorized.includes(args[0]))
        global.authorized.splice(global.authorized.indexOf(args[0]), 1);
      else
        global.authorized.push(args[0]);
    }
  }));

  return {
    documentation,
    cleanup() {
      deregister.forEach(d => d());
    }
  }
};

/*

some notes

brikkit._brickadia.write(`\n`);

cmd GetAll BRPlayerState PlayerName
cmd GetAll BRPlayerState Owner Name=BP_PlayerState_C_0
cmd GetAll BP_PlayerController_C Pawn Name=BP_PlayerController_C_0
cmd GetAll SceneComponent RelativeLocation Name=CollisionCylinder Outer=BP_FigureV2_C_0

te_C_0.Owner = BP_PlayerController_C'/Game/Maps/Plate/Plate.Plate:PersistentLevel.BP_PlayerController_C_0''

CapsuleComponent /Game/Maps/Plate/Plate.Plate:PersistentLevel.BP_FigureV2_C_0.CollisionCylinder.RelativeLocation = (X=-200.000000,Y=120.000000,Z=25.000000)

PersistentLevel.BP_FigureV2_C_0.CollisionCylinder.RelativeLocation = (X=-200.000000,Y=120.000000,Z=25.000000)

cmd GetAll BP_FigureV2_C PointAtLocation Name=BP_FigureV2_C_0

cmd GetAll BRPlayerState Owner Name=BP_PlayerState_C_0

GetAll BP_FigureV2_C PointAtLocation
GetAll BP_FigureV2_C Role

ListProps BP_PlayerController_C *

// get player permissions
GetAll BRPlayerState PermissionsRoles

// disconnect message
// make note of "Owner: BP_PlayerController_C_13"
LogNet: UChannel::Close: Sending CloseBunch. ChIndex == 0. Name: [UChannel] ChIndex: 0, Closing: 0 [UNetConnection] RemoteAddr: <snip> , Name: IpConnection_13, Driver: GameNetDriver IpNetDriver_1, IsServer: YES, PC: BP_PlayerController_C_13, Owner: BP_PlayerController_C_13, UniqueId: INVALI


*/
