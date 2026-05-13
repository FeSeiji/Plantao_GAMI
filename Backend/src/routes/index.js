const { Router } = require('express');
const healthController = require('../controllers/healthController');
const hello = require('../controllers/hello');
const hospital = require('../controllers/hospital')

const router = Router();

router.get('/health', healthController.check);

router.get('/salve', hello.salve);

router.get('/hospital',hospital.CreateHospital);

module.exports = router;
