// Documentation for this game, also for helptext generator
const documentation = {
  name: 'minesweeper',
  description: 'Play and generate minesweeper games',
  author: 'cake',
  commands: [{
    name: '!ms:start',
    description: 'Start a game of minesweeper',
    example: '!ms:start width:30 height:16 mines:130',
    args: [
      {name: 'size:#', description: 'sets width and height of game (default: 10)', required: false},
      {name: 'width:#', description: 'sets width of game (default: 10)', required: false},
      {name: 'height:#', description: 'sets height of game (default: 10)', required: false},
      {name: 'mines:#', description: 'sets height of game (default: 15)', required: false},
    ]
  }, {
    name: '!ms:mine',
    description: 'Mine a tile in tile below the player in an active game',
    example: '!ms:mine',
    args: [],
  }, {
    name: '!ms:reset',
    description: 'Clear all bricks and reset game data (config authorized only)',
    example: '!ms:reset',
    args: [],
  }, {
    name: '!ms:trust',
    description: 'Toggle trust of user to play on your active games',
    example: '!ms:trust Zeblote',
    args: [
      {name: 'username', description: 'Username of target player', required: true},
    ],
  }]
};

const brs = require('brs-js');
const fs = require('fs');
const { sanitize } = require('../../util.js');

const { ParseTool, WriteTool, moveBricks, studs } = require('../cakeutils/util.tool.js');
const PlayerPosProvider = require('../cakeutils/util.playerPos.js');
const CooldownProvider = require('../cakeutils/util.cooldown.js');

// determine which tileset to use
const MINESIZE = 8; // 4 is also an option for uglier and smaller grid
const MINESAVE = __dirname + '/tileset.brs';

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
  global.minesweeperTrust = global.minesweeperTrust || {};

  const getPlayerPos = PlayerPosProvider(brikkit, deregister);
  const cooldown = CooldownProvider(1000);

  // helper for finding the game a player is over
  const findGame = (x, y) => global.minesweepers.find(game =>
    x >= game.left && y >= game.top && y < game.bottom && x < game.right && game.inProgress);

  // determine if a user trusts another player
  const hasTrust = (owner, user) =>
    owner === user || global.minesweeperTrust[owner] && global.minesweeperTrust[owner].includes(user);


  deregister.push(brikkit.on('chat', evt => {
    const name = evt.getSender().getUsername();
    const [command, ...args] = evt.getContent().split(' ');
    const now = Date.now();

    if (command === '!ms:start' && cooldown(name)) {
      if (global.minesweepers.find(m => m.name === name && m.inProgress)) {
        brikkit.say(`"<b>${sanitize(name)}</> already has a game in progress"`)
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
        brikkit.say(`"<b>${sanitize(name)}</>'s game would have too many mines"`);
        return;
      }

      // create a new game
      const startGame = (x, y) => {
        const left = x;
        const top = y;
        const bottom = (y + height);
        const right = (x + width);
        brikkit.say(`"<b>${sanitize(name)}</> starting at (${left},${top}) (${width}x${height} ${mines} mines)"`)

        if (global.minesweepers.find(m =>
          !(left > m.right ||
           right < m.left ||
           top > m.bottom ||
           bottom < m.top)
        )) {
          brikkit.say(`"<b>${sanitize(name)}</> can't start a game here"`)
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
    if (command === '!ms:mine' && cooldown(name)) {
      // mine at a position
      const mine = (x, y) => {
        const game = findGame(x, y);

        if (!game) {
          brikkit.say(`"<b>${sanitize(name)}</> not over an active game"`)
          return;
        }

        if (!hasTrust(game.name, name)) {
          brikkit.say(`"<b>${sanitize(game.name)}</> does not trust you to do that, <b>${sanitize(name)}</>"`)
          return;
        }

        const cx = x - game.x;
        const cy = y - game.y;

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
          brikkit.say(`"<color=\\"ff9999\\"><b>${sanitize(name)}</> lost a game${name !== game.name ? ` on <b>${sanitize(game.name)}</>'s behalf` : ' '}...</> (${game.width}x${game.height} ${game.mines} mines)"`)
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

    // trust a player
    if (command === '!ms:trust' && cooldown(name) && args[0]) {
      if (!brikkit.getPlayerFromUsername(args[0])) {
        brikkit.say(`"Could not find <b>${sanitize(args[0])}</>"`)
        return;
      }

      if (!global.minesweeperTrust[name])
        global.minesweeperTrust[name] = [];

      if (global.minesweeperTrust[name].includes(args[0])) {
        global.minesweeperTrust[name].splice(global.minesweeperTrust[name].indexOf(args[0]), 1);
        brikkit.say(`"<b>${sanitize(name)}</> no longer trusts <b>${sanitize(args[0])}</> for minesweeper"`)
      }
      else {
        global.minesweeperTrust[name].push(args[0]);
        brikkit.say(`"<b>${sanitize(name)}</> now trusts <b>${sanitize(args[0])}</> for minesweeper"`)
      }
    }

    if (command === '!ms:reset' && authorized.includes(name)) {
      global.minesweepers = [];
      brikkit.clearAllBricks();
      return;
    }
  }));

  return {
    cleanup() {
      deregister.forEach(d => d());
    },
    documentation,
  };
};
