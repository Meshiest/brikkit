/*
  cake's player finding tool w/ console command support from Aware
*/

const { debounce } = require('../../util.js');

// get all players' positions
module.exports = (brikkit, deregister) => playerName => {
  const write = str => brikkit._brickadia.write(str + '\n');
  return new Promise((resolve, reject) => {
    let cb;
    const id = setTimeout(() => {
      clean();
      reject();
    }, 1000);
    const timeout = () => clearTimeout(id)

    const clean = () => {
      timeout();
      deregister.splice(deregister.indexOf(timeout), 1);
      deregister.splice(deregister.indexOf(cb), 1);
    };

    let players = [];

    const done = debounce(() => {
      clean();
      resolve(players);
    }, 50);

    deregister.push(timeout);
    deregister.push(cb = brikkit._brickadia.on('out', line => {
      // a few line parsers for the various console commands
      const regexes = [{
        name: 'pos',
        regex: /CapsuleComponent .+?PersistentLevel\.(?<pawn>BP_FigureV2_C_\d+)\.CollisionCylinder\.RelativeLocation = \(X=(?<x>[\d\.-]+),Y=(?<y>[\d\.-]+),Z=(?<z>[\d\.-]+)\)/
      }]
        // join them into an object
        .reduce((acc, {name, regex}) => {
          acc[name] = line.match(regex);
          return acc;
        }, {});

      // check if this is player position data
      if (regexes.pos) {
        let { x, y, z, pawn } = regexes.pos.groups;
        x = Number(x), y = Number(y), z = Number(z);
        players.push({x, y, z});
        done();
      }
    }));
    write('GetAll SceneComponent RelativeLocation Name=CollisionCylinder');
  });
};