/*
  cake's chunkloader provider - focus on terrain rather than the chunkloading implementation
*/

const AllPlayerPosProvider = require ('./util.allPlayerPos.js');
const { linearRGB } = require('./util.color.js');

const author = {
  id: '64f876ca-d34a-4468-a755-7be03c722944',
  name: 'Gen',
};

const DEFAULT_BLOCK_SIZE = 40;
const DEFAULT_CHUNK_SIZE = 8;
const DEFAULT_VIEW_DIST = 2;
const DEFAULT_RENDER_RATE = 1000; // miliseconds

class Chunkloader {
  constructor(brikkit, deregister, options={}) {
    // player pos provider to track all players
    this.getAllPlayerPos = AllPlayerPosProvider(brikkit, deregister);

    this.blockSize = options.blockSize || DEFAULT_BLOCK_SIZE;
    this.chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE;
    this.viewDistance = options.viewDistance || DEFAULT_VIEW_DIST;
    this.is3d = !!options.is3d;
    this.renderRate = options.renderRate || DEFAULT_RENDER_RATE;

    this.brikkit = brikkit;
    this.deregister = deregister;

    this.loadedChunks = {};

    this.chunkloaderIntervals = [];
    deregister.push(this.stopChunkloading.bind(this));
    this.nextFrame = this.nextFrame.bind(this);

    // set this to false in your super or override after constructor
    this.blockFromPos._default = true;
  }

  // user override - adds blocks to a chunk
  blockFromPos({x, y, z, chunk, offset}) {
    /*
    return {
      x, y, z,
      tile: true, // true if you want the block to be a tile
      color: [r, g, b, a], // each val is 0-255
    }
    */
  }

  // user override - adds decorations to a terrain chunk
  decorateChunk({x, y, z}, blocks) {
    /*
      add blocks to this chunk based on chunk position (x, y, z)
    */
  }


  // start chunkloading a save
  startChunkloading() {
    this.stopChunkloading();
    this.chunkloaderIntervals.push(setInterval(this.nextFrame, this.renderRate));
  }

  stopChunkloading() {
    this.chunkloaderIntervals.forEach(i => clearInterval(i))
    this.chunkloaderIntervals = [];
  }

  // render an array of screens
  renderChunks(chunks) {
    console.log('rendering');
    // filter out underground or already loaded chunks
    chunks = chunks.filter(c => c.z >=0 && !c.loaded);

    // pre-emptively count number of blocks in the chunks to load
    // also convert the blocks in memory into bricks
    const brickCount = chunks.reduce((n, chunk) => {
      for (let i = 0; i < chunk.blocks.length; i++) {
        const block = chunk.blocks[i];
        if (block) {
          n ++; // increase brick count
          // replace old brick with new block
          chunk.blocks[i] = {
            asset_name_index: block.tile ? 0 : 1,
            size: [this.blockSize / 2, this.blockSize / 2, this.blockSize / 2],
            position: [
              Math.round(this.blockSize/2 + this.blockSize * (block.x + this.chunkSize * chunk.x)),
              Math.round(this.blockSize/2 + this.blockSize * (block.y + this.chunkSize * chunk.y)),
              Math.round(this.blockSize/2 + this.blockSize * (block.z + this.chunkSize * chunk.z)),
            ],
            color: linearRGB(block.color || [255, 255, 255, 255]),
            rotation: 0,
            visibility: true,
            collision: true,
            direction: 4,
          };
        }
      }
      return n;
    }, 0);
    console.log('brickCount', brickCount);

    // memory allocation is slower than iterating so rather than using .flatMap.filter.map/etc
    // it is faster to loop twice and allocate once
    const bricks = Array(brickCount);

    // assign all the bricks to their positions in the brick array
    let i = 0;
    for (const chunk of chunks) {
      for (const brick of chunk.blocks) {
        if (brick) bricks[i++] = brick;
      }
      chunk.loaded = true;
    }

    // return save data
    return {
      author,
      description: 'generate test',
      brick_owners: [author],
      brick_assets: ['PB_DefaultTile', 'PB_DefaultBrick'],
      bricks,
    };
  }

  nextFrame() {
    // developer did not update the default terrain generator and will not generate any terrain
    if (this.blockFromPos._default) {
      console.log('Chunkloader is missing blockFromPos override');
      return;
    }

    this.getAllPlayerPos()
      .then(players => {
        const chunks = players
          // get chunk positions from player pos
          .map(({x, y, z}) => this.getChunkifyPos(x, y, z))
          // get all neighboring chunks
          .flatMap(([x, y, z]) => this.getNeighboringChunks(x, y, z))
          // generate all chunks from the neighbors
          .map(([x, y, z]) => this.getChunk(x, y, z))
          // remove ones that were already generated
          .filter(([generated, chunk]) => !generated)
          // return list of chunks
          .map(([_, chunk]) => chunk);

        // render the chunks into bricks
        const data = this.renderChunks(chunks);

        // only load a save if we have bricks
        if (data.bricks.length > 0) {
          console.log(data.bricks[0], data.bricks.length)
          this.brikkit.writeSaveData('chunkloader', data);
          this.brikkit.loadBricks('chunkloader');
        }
      })
      .catch(e => {
        console.log('chunkloader error', e);
      });
  }

  // find a chunk position from world position
  getChunkifyPos(x, y, z) {
    return [x, y, z].map(x => Math.floor(x/this.blockSize/this.chunkSize))
  }

  // find all neighboring chunks
  getNeighboringChunks(x, y, z=0) {
    const neighbors = [];
    // find an area around a chunk
    for (let i = -this.viewDistance; i <= this.viewDistance; i++) {
      for (let j = -this.viewDistance; j <= this.viewDistance; j++) {
        if (this.is3d) {
          for (let k = -this.viewDistance; k <= this.viewDistance; k++)
            neighbors.push([x+i, y+j, z+k]);
        } else {
          neighbors.push([x+i, y+j, z]);
        }
      }
    }
    return neighbors;
  }

  // find or generate a chunk
  getChunk(x, y, z) {
    if (!this.is3d)
      z = 0;

    const chunkId = [x,y,z].join(',');

    if (this.loadedChunks[chunkId]) {
      return [true, this.loadedChunks[chunkId]];
    } else {
      return [false, this.loadedChunks[chunkId] = this.generateChunk(x, y, z)];
    }
  }

  // generate a new chunk
  generateChunk(x, y, z) {
    const posFromIndex = i =>
      this.is3d ? {
        x: i % this.chunkSize,
        y: Math.floor(i / this.chunkSize) % this.chunkSize,
        z: Math.floor(i / this.chunkSize / this.chunkSize),
        chunk: {x, y, z},
        offset: {x: x * this.chunkSize, y: y * this.chunkSize, z: z * this.chunkSize},
      } : {
        x: i % this.chunkSize,
        y: Math.floor(i / chunkSize),
        chunk: {x, y},
        offset: {x: x * this.chunkSize, y: y * this.chunkSize},
      };

    // Create an empty array as big as the chunk
    const blockCount = this.chunkSize * this.chunkSize * (this.is3d ? this.chunkSize : 1);
    const blocks = Array(blockCount);

    // Create the terrain
    for (let i = 0; i < blockCount; i++)
      blocks[i] = this.blockFromPos(posFromIndex(i));

    // allow for additional decorations
    this.decorateChunk({x, y, z}, blocks);

    return {
      loaded: false,
      x, y, z, blocks,
    };
  }

}

const ChunkloaderProvider = (brikkit, deregister) => {
  return options => new Chunkloader(brikkit, deregister, options);
}

ChunkloaderProvider.Chunkloader = Chunkloader;

module.exports = ChunkloaderProvider;