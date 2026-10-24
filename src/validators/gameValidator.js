const validateGame = (req) => {
  const errors = [];

  // Validate title
  if (!req.body.title || req.body.title.trim().length === 0) {
    errors.push({ field: 'title', message: 'Title is required' });
  }

  // Validate description
  if (!req.body.description || req.body.description.trim().length === 0) {
    errors.push({ field: 'description', message: 'Description is required' });
  }

  // Validate status
  if (req.body.status && !['pending', 'in-progress', 'completed', 'cancelled'].includes(req.body.status)) {
    errors.push({ field: 'status', message: 'Invalid status value' });
  }

  return errors;
};

const validateGameUpdate = (req) => {
  const errors = [];

  // Validate title if provided
  if (req.body.title && req.body.title.trim().length === 0) {
    errors.push({ field: 'title', message: 'Title cannot be empty' });
  }

  // Validate status if provided
  if (req.body.status && !['pending', 'in-progress', 'completed', 'cancelled'].includes(req.body.status)) {
  }

  return errors;
};

module.exports = {
  gameValidator: validateGame,
  gameUpdateValidator: validateGameUpdate
};