const { Router } = require('express');
const healthController = require('../controllers/healthController');
const hello = require('../controllers/hello');
const hospital = require('../controllers/hospital')
const user = require('../controllers/users')

const router = Router();

router.get('/health', healthController.check);

//router.get('/hospital',hospital.CreateHospital);

router.get('/users',user.getUsers);

module.exports = router;
