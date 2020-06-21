const brs = require('brs-js');
const fs = require('fs');
const { sanitize } = require('../../util.js');
// try{require('disrequire')('./util.tool.js');}catch(e){console.log(e)}
const { ParseTool, WriteTool, moveBricks, studs } = require('./util.tool.js');
const PlayerPosProvider = require('./util.playerPos.js');

// determine which tileset to use
const MINESIZE = 8; // 4 is also an option for uglier and smaller grid
const MINESAVE = __dirname + '/minetiles.brs';

const minetiles = new ParseTool(brs.read(fs.readFileSync(MINESAVE)));

// parse the tileset
const tiles = Object.fromEntries(Object.entries({
  tile: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Metallic', color: 1}),
  mine: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Metallic', color: 2}),
  x: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Metallic', color: 3}),
  smile: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Glow', color: 1}),
  frown: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Glow', color: 2}),
  sunglasses: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Glow', color: 3}),
  0: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Glow', color: 0}),
  1: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Hologram', color: 0}),
  2: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Hologram', color: 1}),
  3: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Hologram', color: 2}),
  4: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Hologram', color: 3}),
  5: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Hologram', color: 4}),
  6: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Hologram', color: 5}),
  7: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Hologram', color: 6}),
  8: ({asset: 'PB_DefaultBrick', size: [MINESIZE*5, MINESIZE*5, 2], material: 'BMC_Hologram', color: 7}),
}).map(([i, q]) => {
  const plate = minetiles.query(q)[0];
  return [i, moveBricks(minetiles.aboveBrick(plate), plate.position.map(v => -v))];
}));

// generate a save from a list of tiles ({tile: 'tile name', pos: [x, y, z]})
const getTileSave = grid => {
  const tool = new WriteTool(minetiles.save).empty();
  for (const {tile, pos: [x, y, z]} of grid) {
    tool.addBrick(...moveBricks(tiles[tile], studs(x * MINESIZE, y * MINESIZE, z)));
  }
  const save = tool.write();
  return save;
};

// populate a minesweeper board with mines, provide some helper funcs
const genMinesweeperBoard = (width, height, mines) => {
  // build the board widthxheight
  const board = Array.from({length: width})
    .map(() => Array.from({length: height}).fill(0));

  // rand helper fn
  const rand = n => Math.floor(Math.random() * n);

  // place a mine on the board
  const placeMine = () => {
    let x, y;
    do {
      x = rand(width);
      y = rand(height);
    } while(board[x][y] === 1 || (x === 0 && y === 0 || x === 0 && y === height-1 || x === width-1 && y === 0 || x === width-1 && y === height-1));
    board[x][y] = 1;
  };

  // place mines on the board
  for(let i = 0; i < mines; i++)
    placeMine();

  // determine if a coordinate is a mine
  board.isMine = (x, y) => x >= 0 && x < width && y >= 0 && y < height && board[x][y] === 1;

  // count mines around a cell
  board.count = (x, y) => [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]]
    .map(n => [x+n[0], y+n[1]])
    .filter(([nx, ny]) => nx >= 0 && nx < width && ny >= 0 && ny < height && board[nx][ny] === 1)
    .length;

  return board;
}

module.exports = brikkit => {
  const deregister = [];
  // list of authorized users from config
  const authorized = ((brikkit.server.config || {}).minesweeper || {}).authorized || [];

  // minesweeper state that persists across saves
  global.minesweepers = global.minesweepers || [];

  const getPlayerPos = PlayerPosProvider(brikkit, deregister);

  const lastCommand = {};

  deregister.push(brikkit.on('chat', evt => {
    const name = evt.getSender().getUsername();
    const [command, ...args] = evt.getContent().split(' ');
    const now = Date.now();

    const cooldown = () => {
      if (authorized.includes(name))
        return true;

      const isOk = !lastCommand[name] || (lastCommand[name] + 1000 < now);
      if (isOk) {
        lastCommand[name] = now;
      }
      return isOk;
    };

    if (command === '!start' && cooldown()) {
      if (global.minesweepers.find(m => m.name === name && m.inProgress)) {
        brikkit.say(`"${sanitize(name)} already has a game in progress"`)
        return;
      }

      // default game setup
      let width = 10;
      let height = 10;
      let mines = 15;

      // parse key:val from args
      for (const arg of args) {
        if (arg.split(':').length !== 2) continue;
        let [key, val] = arg.split(':');

        val = parseInt(val);
        if (val != Math.floor(val))
          continue;

        switch(key) {
        case 'width':
          width = Math.max(Math.min(50, val), 5);
          break;
        case 'height':
          height = Math.max(Math.min(50, val), 5);
          break;
        case 'size':
          width = Math.max(Math.min(50, val), 5);
          height = Math.max(Math.min(50, val), 5);
          break;
        case 'mines':
          mines = Math.max(val, 1);
          break;
        }
      }

      if(mines > width * height - 5) {
        brikkit.say(`"${sanitize(name)}'s game would have too many mines"`);
        return;
      }

      // create a new game
      const startGame = (x, y) => {
        const left = x;
        const top = y;
        const bottom = (y + height);
        const right = (x + width);
        brikkit.say(`"${sanitize(name)} starting at (${left},${top}) (${width}x${height} ${mines} mines)"`)

        if (global.minesweepers.find(m =>
          !(left > m.right ||
           right < m.left ||
           top > m.bottom ||
           bottom < m.top)
        )) {
          brikkit.say(`"${sanitize(name)} can't start a game here"`)
          return;
        }

        const game = {
          width, //BOARDSIZE
          height, //BOARDSIZE
          mines,
          name,
          inProgress: true,
          x, y,
          left, top, bottom, right,
        };

        game.generated = Array.from({length: width})
          .map(() => Array.from({length: height}).fill(0));

        let grid = [];
        game.board = genMinesweeperBoard(game.width, game.height, mines);
        grid.push({tile: 'smile', pos: [-1 + left, -1 + top, 1]});
        for (let i = 0; i < game.width; i++)
          for (let j = 0; j < game.height; j++)
            grid.push({tile: 'tile', pos: [i + left, j + top, 1]});
        brikkit.writeSaveData('mine_' + name, getTileSave(grid));
        brikkit.loadBricks('mine_' + name);
        global.minesweepers.push(game);
      };

      // get player position and start game at that spot
      getPlayerPos(name)
        .catch(() => brikkit.say(`"Could not find ${sanitize(name)}"`))
        .then(({x, y, z}) => startGame(Math.round(x/MINESIZE/10), Math.round(y/MINESIZE/10))); //BOARDSIZE
    }

    // mine the current location
    if (command === '!mine' && cooldown()) {
      const game = global.minesweepers.find(m => m.name === name && m.inProgress);
       if (!game) {
        brikkit.say(`"${sanitize(name)} does not have a game in progress"`)
        return;
      }

      // mine at a position
      const mine = (x, y) => {
        const cx = x - game.x;
        const cy = y - game.y;

        // check if the current position is in the grid
        if (cx < 0 || cy < 0 || cy >= game.height || cx >= game.width) {
          brikkit.say(`"${sanitize(name)} is off the grid"`)
          return;
        }
        let grid = [];

        // end game if there's a mine
        if(game.board.isMine(cx, cy)) {
          // render an X at this mine
          grid.push({tile: 'x', pos: [cx, cy, 3]});

          // render the game mines
          for(let i = 0; i < game.width; i++)
            for(let j = 0; j < game.width; j++)
              if (game.board.isMine(i, j))
                grid.push({tile: 'mine', pos: [i, j, 2]});

          // end the game, add a frown
          game.inProgress = false;
          grid.push({tile: 'frown', pos: [-1, -1, 2]});
          brikkit.say(`"<color=\\"ff9999\\"><b>${sanitize(name)}</> lost a game...</> (${game.width}x${game.height} ${game.mines} mines)"`)
        } else {
          const count = game.board.count(cx, cy);
          // render the count if there's more than 0
          if (count > 0) {
            grid.push({tile: count, pos: [cx, cy, 2]});
          } else {
            // otherwise recursively reveal the cells that are adjacent to connecting 0's
            let revealed = {};

            // check if a cell has been or will be revealed
            const hidden = (x, y) => !revealed[x + '_' + y] && !game.generated[x][y];

            function reveal(x, y) {
              // reveal this cell
              revealed[x + '_' + y] = true;

              // render the count
              const count = game.board.count(x, y);
              grid.push({tile: count, pos: [x, y, 2]});

              // don't recurse if this is nonzero
              if (count !== 0)
                return;

              // reveal in all 8 directions if not already revealed
              if (y > 0 && hidden(x, y - 1)) reveal(x, y - 1);
              if (y < (game.height - 1) && hidden(x, y + 1)) reveal(x, +y + 1);
              if (x < (game.width - 1) && hidden(x + 1, y)) reveal(+x + 1, y);
              if (x > 0 && hidden(x - 1, y)) reveal(x - 1, y);
              if (y > 0 && x > 0 && hidden(x - 1, y - 1)) reveal(x - 1, y - 1);
              if (y > 0 && x < (game.width - 1) && hidden(x + 1, y - 1)) reveal(x + 1, y - 1);
              if (y < (game.height - 1) && x < (game.width - 1) && hidden(x + 1, y + 1)) reveal(x + 1, y + 1);
              if (y < (game.height - 1) && x > 0 && hidden(x - 1, y + 1)) reveal(x - 1, +y + 1);
            }
            reveal(cx, cy);
          }
        }

        // remove ones that were already generated
        grid = grid.filter(({pos: [x, y, z]}) => x < 0 || y < 0 || !game.generated[x][y])
        grid.forEach(({pos: [x, y, z]}) => {
          if(x >= 0 && y >= 0) game.generated[x][y] = 1
        });

        // count revealed cells
        let revealed = 0;
        for (let i = 0; i < game.width; i++)
          for (let j = 0; j < game.height; j++)
            if (game.generated[i][j])
              revealed ++;

        // only win if the game is in progress and all the non-bomb cells have been reveal
        let win = false;
        if (game.inProgress && revealed === game.width * game.height - game.mines) {
          game.inProgress = false;
          win = true;
          // render sunglasses
          grid.push({tile: 'sunglasses', pos: [-1, -1, 2]});
        }

        // write to save and load bricks
        brikkit.writeSaveData('mine_' + name, getTileSave(grid
          .map(({tile, pos: [x, y, z]}) => ({tile, pos: [x + game.left, y + game.top, z]}))
        ));
        brikkit.loadBricks('mine_' + name);

        // announce win
        if (win)
          brikkit.say(`"<color=\\"99ff99\\"><b>${sanitize(name)}</> finished a game!</> (${game.width}x${game.height} ${game.mines} mines)"`)
      }

      getPlayerPos(name)
        .catch(() => brikkit.say(`"Could not find ${sanitize(name)}"`))
        .then(({x, y, z}) => mine(Math.round(x/MINESIZE/10), Math.round(y/MINESIZE/10)));
    }

    if (command === '!reset' && authorized.includes(name)) {
      global.minesweepers = [];
      brikkit.clearAllBricks();
      return;
    }
  }));

  return {
    cleanup() {
      deregister.forEach(d => d());
    },
  }
};
