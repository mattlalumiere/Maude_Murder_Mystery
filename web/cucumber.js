// BDD: Gherkin features live in features/, step definitions in test/bdd/.
module.exports = {
  default: {
    paths: ["features/**/*.feature"],
    import: ["test/bdd/**/*.ts"],
    format: ["progress-bar", "summary"],
  },
};
