const { Router } = require('express');
const { getPnrStatus } = require('../services/pnr');

const router = Router();

router.get('/:pnr', async (req, res, next) => {
  try {
    const pnr = (req.params.pnr || '').trim();
    if (!/^\d{10}$/.test(pnr)) {
      return res.status(400).json({ success: false, error: 'PNR must be a 10-digit number' });
    }
    const data = await getPnrStatus(pnr);
    res.json({ success: true, data });
  } catch (err) {
    if (err.code === 'PNR_NOT_FOUND') {
      return res.status(404).json({ success: false, error: err.message, code: 'PNR_NOT_FOUND' });
    }
    next(err);
  }
});

module.exports = router;
