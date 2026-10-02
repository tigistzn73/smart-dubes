// Public routes.
//
// Everything here is reachable without a session, because Twilio fetches MMS
// media with a plain GET and cannot present a JWT. The only unauthenticated
// surface is the court-letter image, and it is guarded by a signed expiring token
// scoped to a single escalation case, in the same spirit as a password-reset
// link: whoever holds the URL may read that one document, for a bounded time.

const express = require('express');
const db = require('../config/database');
const { verifyCourtLetterToken } = require('../services/courtLetterToken');
const { renderCourtLetterPng } = require('../services/courtLetterImageService');

const router = express.Router();

// Cached aggressively. The image for a given case is immutable once issued, and
// carriers re-fetch media URLs while retrying a message.
const IMAGE_CACHE_CONTROL = 'private, max-age=86400';

/**
 * GET /api/public/court-letter/:caseId/:file
 *
 * `file` is "<token>.png". The extension is part of the generated URL so carriers
 * and browsers treat the response as an image, but it is stripped here before the
 * token is verified: only the "<caseId>.<expiry>.<signature>" portion is signed.
 *
 * Returns the court letter as a PNG, rendered from the snapshot stored at issue
 * time so the image can never disagree with the text the customer was notified
 * with.
 */
router.get('/court-letter/:caseId/:file', async (req, res) => {
  const { caseId: caseIdRaw, file } = req.params;
  const caseId = Number(caseIdRaw);

  if (!Number.isInteger(caseId) || caseId <= 0) {
    return res.status(404).json({ error: 'Not found.' });
  }

  if (typeof file !== 'string' || !file.toLowerCase().endsWith('.png')) {
    return res.status(404).json({ error: 'Not found.' });
  }

  const token = file.slice(0, -'.png'.length);
  const verdict = verifyCourtLetterToken(token);
  if (!verdict.valid) {
    // Distinguish an expired link from a forged one in the logs, but return the
    // same response to the caller so the route cannot be probed.
    console.warn(`[COURT LETTER IMAGE] Rejected token for case #${caseIdRaw}: ${verdict.reason}`);
    return res.status(404).json({ error: 'Not found.' });
  }

  // A token for case A must never render case B.
  if (verdict.caseId !== caseId) {
    console.warn(`[COURT LETTER IMAGE] Token/case mismatch: token is for #${verdict.caseId}, requested #${caseId}`);
    return res.status(404).json({ error: 'Not found.' });
  }

  const escalationCase = await db.get(
    `SELECT id, court_letter_ref, court_letter_doc
     FROM escalation_cases
     WHERE id = $1 AND court_letter_sent_at IS NOT NULL`,
    [caseId]
  );

  if (!escalationCase || !escalationCase.court_letter_doc) {
    return res.status(404).json({ error: 'Not found.' });
  }

  try {
    const png = renderCourtLetterPng(escalationCase.court_letter_doc);

    res.set('Content-Type', 'image/png');
    res.set('Content-Length', String(png.length));
    res.set('Cache-Control', IMAGE_CACHE_CONTROL);
    res.set('X-Content-Type-Options', 'nosniff');
    return res.status(200).end(png);
  } catch (err) {
    // A render failure must not surface as a 500 that Twilio retries forever.
    console.error(`[COURT LETTER IMAGE] Render failed for case #${caseId}: ${err.message}`);
    return res.status(503).json({ error: 'Letter image unavailable.' });
  }
});

module.exports = router;