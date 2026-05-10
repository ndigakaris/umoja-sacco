const express = require('express');
const router = express.Router();
const { authenticate, authorize, authorizeOwnerOrAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/membersController');

router.get('/', authenticate, authorize('admin', 'treasurer', 'auditor'), ctrl.listMembers);
router.post('/', authenticate, authorize('admin'), ctrl.createMember);
router.get('/:id', authenticate, ctrl.getMember);
router.patch('/:id', authenticate, authorize('admin', 'treasurer'), ctrl.updateMember);
router.patch('/:id/kyc', authenticate, authorize('admin', 'treasurer'), ctrl.updateKyc);
router.get('/:id/statement', authenticate, ctrl.getStatement);

module.exports = router;
