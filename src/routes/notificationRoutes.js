const express = require('express');
const { authentifier } = require('../middleware/auth');
const { resoudreTenant } = require('../middleware/tenant');
const { listerMesNotifications, marquerCommeLue } = require('../controllers/notificationController');

const router = express.Router();

router.use(authentifier, resoudreTenant);

router.get('/', listerMesNotifications);
router.put('/:id/lue', marquerCommeLue);

module.exports = router;
