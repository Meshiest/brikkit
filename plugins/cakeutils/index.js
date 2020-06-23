const documentation = {
  name: 'cakeutils',
  description: 'Provides developers with a few utility files. You probably don\'t need this in your plugins list.',
  author: 'cake',
};

console.log('You may have included cakeutils in your plugins list by accident');

module.exports = brikkit => {
  return {
    documentation,
  }
};
