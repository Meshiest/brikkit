const documentation = {
  name: 'sudoku',
  description: 'Generates sudoku',
  author: 'cake',
  commands: [{
    name: '!sudoku',
    description: 'Generate a sudoku of variable difficulty',
    example: '!sudoku hard',
    args: [
      {name: 'difficulty', description: '<code>easy</>, <code>medium</>, <code>hard</>, or <code>very hard</>', required: false},
    ],
  }],
};

const { sanitize } = require('../../util.js');
const PlayerPosProvider = require('../cakeutils/util.playerPos.js');
const CooldownProvider = require('../cakeutils/util.cooldown.js');
const fontParser = require('../cakeutils/util.fontParser.js');

const font = fontParser(__dirname  + '/font.brs');

// sudoku generator library
const Sudoku = require('./lib.sudoku.js');
const DIFFICULTIES = ['easy', 'medium', 'hard', 'very hard'];

module.exports = brikkit => {
  const deregister = [];
  const getPlayerPos = PlayerPosProvider(brikkit, deregister);
  const cooldown = CooldownProvider(5000);

  deregister.push(brikkit.on('chat', evt => {
    const name = evt.getSender().getUsername();
    const [command, ...args] = evt.getContent().split(' ');

    if (command === '!sudoku' && cooldown(name)) {
      getPlayerPos(name)
        .then(({x, y, z}) => {
          // snap coords to grid
          x = Math.round(x/10)*10+5;
          y = Math.round(y/10)*10+5;
          z = Math.round(z/4)*4;

          // generate a sudoku
          const generatedSudoku = Sudoku(DIFFICULTIES.includes(args.join(' ')) ? args.join(' ') : 'medium');

          // get the board and analysis
          const analysis = generatedSudoku.analyzeBoard();
          const sudokuBoard = generatedSudoku.getBoard();


          const chars = [];
          for (let i = 0; i < 9; i++) {
            // build red numbers off to the side
            chars.push({
              char: (1 + i) + '',
              pos: [-1 * 7 * 10, i * 7 * 10, -4],
              color: [255, 0, 0, 255],
            });

            // render the sudoku in a 7x7 plate grid
            for (let j = 0; j < 9; j++) {
              if(typeof sudokuBoard[j * 9 + i].val === 'number') {
                chars.push({
                  char: sudokuBoard[j * 9 + i].val + ' ',
                  pos: [i * 7 * 10, j * 7 * 10, 0],
                  color: [0, 0, 0, 255],
                });
              }
            }
          }

          // generate alternating colored plates underneath each subgrid
          let grid = [];
          for (let i = 0; i < 3; i++)
            for (let j = 0; j < 3; j++)
              grid.push({
                asset: 'PB_DefaultTile',
                position: [(7 * 3 * i + 7) * 10, (7 * 3 * j + 7) * 10 + 10, 0],
                size: [7 * 3 * 5, 7 * 3 * 5, 2],
                color: (i + j * 3) % 2 ? [255, 255, 255, 255] : [150, 150, 150, 255],
              });

          // write the save
          brikkit.writeSaveData('sudoku_' + name, font.grid(chars, {
            shift: [x, y, z - 22],
            author: {
              id: brikkit.getPlayerFromUsername(name).getUserId(),
              name,
            },
            bricks: grid,
          }));

          brikkit.loadBricks('sudoku_' + name);
          brikkit.say(`"Generated <b>${sanitize(name)}</> a sudoku: ${analysis.level} (${analysis.score})"`)
        })
        .catch(e => {
          brikkit.say(`"Could not find ${sanitize(name)}"`)
        });
    }
  }));

  return {
    documentation,
    cleanup() {
      deregister.forEach(d => d());
    }
  };
};