const Game = require('../models/Game');

// Create a new game
const createGame = async (gameData) => {
  const game = new Game(gameData);
  return await game.save();
};

// Get a game by ID
const getGame = async (gameId) => {
  return await Game.findById(gameId);
};

// Update a game
const updateGame = async (gameId, gameData) => {
  return await Game.findByIdAndUpdate(gameId, gameData, { new: true });
};

// Delete a game
const deleteGame = async (gameId) => {
  return await Game.deleteOne({ _id: gameId });
};

module.exports = {
  createGame,
  getGame,
  updateGame,
  deleteGame
};