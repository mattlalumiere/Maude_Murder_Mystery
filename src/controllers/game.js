const { createGame, getGame, updateGame, deleteGame } = require('../services/gameService');
const { gameValidator, gameUpdateValidator } = require('../validators/gameValidator');

// Create a new game
const createGameController = async (req, res) => {
  try {
    const errors = gameValidator(req);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const game = await createGame(req.body);
    res.status(201).json(game);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get a game by ID
const getGameController = async (req, res) => {
  try {
    const game = await getGame(req.params.id);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    res.json(game);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update a game
const updateGameController = async (req, res) => {
  try {
    const errors = gameValidator(req);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    const game = await updateGame(req.params.id, req.body);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    res.json(game);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete a game
const deleteGameController = async (req, res) => {
  try {
    const result = await deleteGame(req.params.id);
    if (!result) {
      return res.status(404).json({ error: 'Game not found' });
    }
    res.json({ message: 'Game deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createGameController,
  getGameController,
  updateGameController,
  deleteGameController
};