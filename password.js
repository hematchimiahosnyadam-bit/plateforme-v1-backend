const bcrypt = require('bcrypt');

const SALT_ROUNDS = 12;

function hashPassword(motDePasseClair) {
  return bcrypt.hash(motDePasseClair, SALT_ROUNDS);
}

function comparePassword(motDePasseClair, hash) {
  return bcrypt.compare(motDePasseClair, hash);
}

module.exports = { hashPassword, comparePassword };
