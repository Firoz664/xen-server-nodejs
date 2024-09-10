import express from 'express';
import { listVMs, getVMMetrics, startVM, stopVM, rebootVM, createVM, deleteVM } from './XenServer.mjs';
import basicAuth from 'express-basic-auth';

const router = express.Router();

// Async wrapper for route handlers
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Input validation middleware
const validateUUID = (req, res, next) => {
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
  if (!uuidRegex.test(req.params.uuid)) {
    return res.status(400).json({ error: 'Invalid UUID format' });
  }
  next();
};

// Basic authentication for sensitive operations
const auth = basicAuth({
  users: { 'admin': process.env.ADMIN_PASSWORD },
  challenge: true,
});

// Routes
router.get('/vms', asyncHandler(async (req, res) => {
  const vms = await listVMs();
  res.json(vms);
}));

router.get('/vms/:uuid/metrics', validateUUID, asyncHandler(async (req, res) => {
  const metrics = await getVMMetrics(req.params.uuid);
  res.json(metrics);
}));

router.post('/vms/:uuid/start', auth, validateUUID, asyncHandler(async (req, res) => {
  await startVM(req.params.uuid);
  res.json({ message: 'VM started' });
}));

router.post('/vms/:uuid/stop', auth, validateUUID, asyncHandler(async (req, res) => {
  await stopVM(req.params.uuid);
  res.json({ message: 'VM stopped' });
}));

router.post('/vms/:uuid/reboot', auth, validateUUID, asyncHandler(async (req, res) => {
  await rebootVM(req.params.uuid);
  res.json({ message: 'VM rebooted' });
}));

// New route to create a VM
router.post('/vms', auth, asyncHandler(async (req, res) => {
  const { name, template, memory, vcpus } = req.body;
  if (!name || !template || !memory || !vcpus) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  const newVM = await createVM(name, template, memory, vcpus);
  res.status(201).json(newVM);
}));

// New route to delete a VM
router.delete('/vms/:uuid', auth, validateUUID, asyncHandler(async (req, res) => {
  await deleteVM(req.params.uuid);
  res.json({ message: 'VM deleted' });
}));

export default router;