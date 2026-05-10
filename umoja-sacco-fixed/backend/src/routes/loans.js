const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/loansController');

router.get('/', authenticate, ctrl.listLoans);
router.post('/', authenticate, ctrl.applyLoan);
router.post('/:id/approve', authenticate, authorize('admin', 'treasurer'), ctrl.approveLoan);
router.post('/:id/disburse', authenticate, authorize('admin', 'treasurer'), ctrl.disburseLoan);
router.post('/:id/repay', authenticate, authorize('admin', 'treasurer'), ctrl.recordRepayment);
router.get('/:id/schedule', authenticate, ctrl.getSchedule);

module.exports = router;
