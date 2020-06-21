// get a player's position
module.exports = (brikkit, deregister) => playerName => {
  const write = str => brikkit._brickadia.write(str + '\n');
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
};