const brs = require('brs-js');
const fs = require('fs');
const { sanitize } = require('../../util.js');

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
})

const createCage = (author, {x, y, z}) => ({
  author,
  description: 'generate test',
  brick_owners: [author],
  brick_assets: cage.brick_assets,
  materials: cage.materials,
  colors: cage.colors,
  bricks: cage.bricks.map(b => ({
    ...b,
    position: [b.position[0] + x, b.position[1] + y, b.position[2] + z],
  })),
})


module.exports = brikkit => {
  const write = str => brikkit._brickadia.write(str + '\n');
  const deregister = [];

  function getPlayerPos(playerName) {
    return new Promise((resolve, reject) => {
      const playerState = {};
      let status = 0;
      let cb;
      const id = setTimeout(() => {
        clean();
        reject(status);
      }, 1000);
      const timeout = () => clearTimeout(id)

      const clean = () => {
        timeout();
        deregister.splice(deregister.indexOf(timeout), 1);
        deregister.splice(deregister.indexOf(cb), 1);
      };

      deregister.push(timeout);
      deregister.push(cb = brikkit._brickadia.on('out', line => {
        // a few line parsers for the various console commands
        const regexes = [{
          name: 'state',
          regex: /BP_PlayerState_C .+?PersistentLevel\.(?<state>BP_PlayerState_C_\d+)\.PlayerName = (?<name>.*)$/,
        }, {
          name: 'controller',
          regex: /BP_PlayerState_C .+?PersistentLevel\.(?<state>BP_PlayerState_C_\d+)\.Owner = BP_PlayerController_C'.+?:PersistentLevel.(?<controller>BP_PlayerController_C_\d+)'/
        }, {
          name: 'pawn',
          regex: /BP_PlayerController_C .+?PersistentLevel\.(?<controller>BP_PlayerController_C_\d+)\.Pawn = BP_FigureV2_C'.+?:PersistentLevel.(?<pawn>BP_FigureV2_C_\d+)'/
        }, {
          name: 'pos',
          regex: /CapsuleComponent .+?PersistentLevel\.(?<pawn>BP_FigureV2_C_\d+)\.CollisionCylinder\.RelativeLocation = \(X=(?<x>[\d\.-]+),Y=(?<y>[\d\.-]+),Z=(?<z>[\d\.-]+)\)/
        }]
          // join them into an object
          .reduce((acc, {name, regex}) => {
            acc[name] = line.match(regex);
            return acc;
          }, {});

        // check if this is playerstate data and run the next command
        if (regexes.state) {
          const { state, name } = regexes.state.groups;
          if (name === playerName && status === 0) {
            status = 1;
            playerState.name = name;
            playerState.state = state;
            write(`GetAll BRPlayerState Owner Name=${state}`);
          }

        // check if this is player controller data and run the next command
        } else if (regexes.controller) {
          const { state, controller } = regexes.controller.groups;
          if (playerState.state === state && status === 1) {
            status = 2;
            playerState.controller = controller;
            write(`GetAll BP_PlayerController_C Pawn Name=${controller}`);
          }

        // check if this is player pawn data and run the next command
        } else if (regexes.pawn) {
          const { pawn, controller } = regexes.pawn.groups;
          if (playerState.controller === controller && status === 2) {
            status = 3;
            playerState.pawn = pawn
            write(`GetAll SceneComponent RelativeLocation Name=CollisionCylinder Outer=${pawn}`);
          }

        // check if this is player position data and resolve
        } else if (regexes.pos) {
          let { x, y, z, pawn } = regexes.pos.groups;
          if (playerState.pawn === pawn && status === 3) {
            status = 4;
            x = Number(x), y = Number(y), z = Number(z);
            clean();
            resolve({x, y, z});
          }
        }
      }));
      write('GetAll BRPlayerState PlayerName');
    });
  }

  const lastCommand = {};

  deregister.push(brikkit.on('chat', evt => {
    const name = evt.getSender().getUsername();
    const [command, ...args] = evt.getContent().split(' ');
    const now = Date.now();
    if (command === '!origin' && (!lastCommand[name] || (lastCommand[name] + 30000 < now))) {
      lastCommand[name] = now;
      brikkit.writeSaveData('brick', createBrick(0, 0, 0));
      brikkit.loadBricks('brick');
    }
    if (command === '!find' && (!lastCommand[name] || (lastCommand[name] + 30000 < now))) {
      lastCommand[name] = now;
      getPlayerPos(name)
        .then(({x, y, z}) => {
          brikkit.say(`"Found ${name} @ &lt;${x}, ${y}, ${z}&gt;"`);
        })
        .catch(() => brikkit.say(`"Could not find ${sanitize(name)}"`));

    }
    if (command === '!brick' && (!lastCommand[name] || (lastCommand[name] + 30000 < now))) {
      lastCommand[name] = now;
      getPlayerPos(name)
        .then(({x, y, z}) => {
          brikkit.writeSaveData('brick_' + name, createBrick(x, y, z - 30));
          brikkit.loadBricks('brick_' + name);
        })
        .catch(() => brikkit.say(`"Could not find ${sanitize(name)}"`));
    }

    if (command === '!cage' && (!lastCommand[name] || (lastCommand[name] + 30000 < now))) {
      lastCommand[name] = now;
      getPlayerPos(name)
        .then(({x, y, z}) => {
          x = Math.round(x);
          y = Math.round(y);
          z = Math.round(z);
          brikkit.writeSaveData('cage_' + name, createCage(x, y, z - 38));
          brikkit.loadBricks('cage_' + name);
        })
        .catch(() => brikkit.say(`"Could not find ${sanitize(name)}"`));
    }

    if (command === '!trap' && (!lastCommand[name] || (lastCommand[name] + 30000 < now)) && args[0]) {
      lastCommand[name] = now;
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
  }));

  return {
    cleanup() {
      deregister.forEach(d => d());
    }
  }
};

/*

brikkit._brickadia.write(`\n`);

cmd GetAll BRPlayerState PlayerName
cmd GetAll BRPlayerState Owner Name=BP_PlayerState_C_0
cmd GetAll BP_PlayerController_C Pawn Name=BP_PlayerController_C_0
cmd GetAll SceneComponent RelativeLocation Name=CollisionCylinder Outer=BP_FigureV2_C_0

te_C_0.Owner = BP_PlayerController_C'/Game/Maps/Plate/Plate.Plate:PersistentLevel.BP_PlayerController_C_0''

CapsuleComponent /Game/Maps/Plate/Plate.Plate:PersistentLevel.BP_FigureV2_C_0.CollisionCylinder.RelativeLocation = (X=-200.000000,Y=120.000000,Z=25.000000)

PersistentLevel.BP_FigureV2_C_0.CollisionCylinder.RelativeLocation = (X=-200.000000,Y=120.000000,Z=25.000000)

*/