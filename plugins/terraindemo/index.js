const documentation = {
  name: 'terraindemo',
  description: 'A demo for generating chunkloaded terrain automatically.',
  author: 'cake',
  configFormat: {
    authorized: [ // list of authorized users
      'username',
    ],
  },
  commands: [{
    name: '!terrain:next',
    description: 'Generate terrain around everyone once',
    example: '!terrain:next',
    args: [],
  }, {
    name: '!terrain:start',
    description: 'Start continuously generating terrain around all players',
    example: '!terrain:start',
    args: [],
  }, {
    name: '!terrain:stop',
    description: 'Stop generating terrain',
    example: '!terrain:stop',
    args: [],
  }],
};

const ChunkloaderProvider = require('../cakeutils/util.voxelChunkLoader.js');

const noise = require('./lib.noise.js');
noise.seed(Math.random());
// 3d noise helper func
function Noise([x, y, z], freq, [ox, oy, oz]=[0, 0, 0]) {
  return noise.perlin3(x / freq - ox, y / freq - oy, z / freq - oz)
}

// clamp a number helper func
const clamp = (val, min, max) => Math.floor(Math.min(Math.max(min, val), max));

// cool pastel colors in 3d terrain
const colorHelper = (x, y, z, ox, oy, oz) => {
  let val = Math.abs(noise.simplex3(x / 10 + ox, y / 10 + oy, z / 10 + oz)) * 127 + 127;
  return clamp(val, 0, 255);
}

module.exports = brikkit => {
  const deregister = [];
  // list of authorized users from config
  const authorized = ((brikkit.server.config || {}).terraindemo || {}).authorized || [];

  const is3d = true; // change if you want to see 2d terrain
  const newChunkLoader = ChunkloaderProvider(brikkit, deregister);

  const chunkloader = newChunkLoader({
    blockSize: 40,
    chunkSize: 8,
    viewDistance: 2,
    renderRate: 1000,
    is3d,
  })

  // simple 2d terrain
  const terrainFrom2dPos = (x, y) => (
    (noise.simplex2(x * 0.02, y * 0.02) * 4 + 4) +
    (noise.simplex2(x * 0.001, y * 0.001) * 20 + 20)
  );

  // function to be passed into the chunkloader
  const blockFrom2dPos = ({x, y, offset: {x: ox, y: oy}}) => ({
    x, y, z: Math.floor(terrainFrom2dPos(x + ox, y + oy)),
  });

  // 3d terrain just determines if the block should exist
  const terrainFrom3dPos = (x, y, z) => {
    const noises = {
      spaghetti: (
        Math.max(
          Math.abs(Noise([x, y, z], 100 / 4)),
          Math.abs(Noise([x, y, z], 100 / 4, [83.56, 25.84, 15.25])),
        ) < 0.05
      ),
      spaghetti2: (
        Math.max(
          Math.abs(Noise([x, y, z], 100 / 4, [200.56, 125.84, 95.25])),
          Math.abs(Noise([x, y, z], 100 / 4, [0.56, 200.84, 515.25])),
        ) < 0.05
      ),
      waveEdge: (
        Math.abs(Noise([x, y, z], 250 / 4)) < 0.02
      ),
      smallBlobs: (
        Math.abs(Noise([x, y, z], 50 / 4)) > 0.5
      ),
      bigBlobs: (
        Noise([x, y, z], 50 / 4) > 0
      ),
      steps: (
        Math.abs(Noise([x, y, z*5], 100 / 4)) > 0.6
      )
    };

    return (noises.steps || noises.spaghetti || noises.spaghetti2)
  }

  // render block if it should exist, set block color
  const blockFrom3dPos = ({x, y, z, offset: {x: ox, y: oy, z: oz}}) =>
    terrainFrom3dPos(x + ox, y + oy, z + oz) && ({
      x, y, z,
      color: [
        colorHelper(ox, oy, oz, 0, 0, 0),
        colorHelper(ox, oy, oz, 300, 2000, 500),
        colorHelper(ox, oy, oz, 1000, -9000, 2300),
        255,
      ],
    });

  // tell chunkloader to use 2d or 3d generator
  chunkloader.blockFromPos = is3d ? blockFrom3dPos : blockFrom2dPos;

  deregister.push(brikkit.on('chat', evt => {
    const name = evt.getSender().getUsername();
    const [command, ...args] = evt.getContent().split(' ');

    const auth = authorized.includes(name);

    if (command === '!terrain:start' && auth) {
      chunkloader.startChunkloading();
    }

    if (command === '!terrain:next' && auth) {
      chunkloader.nextFrame();
    }

    if (command === '!terrain:stop' && auth) {
      chunkloader.stopChunkloading();
    }
  }));

  return {
    cleanup() {
      deregister.map(d => d());
    },
    documentation,
  }
};
