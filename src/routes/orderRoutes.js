const express = require('express');

const {
  getOrders,
  getOrderById,
  createOrder,
  updateOrderStatus
} = require('../controllers/orderController');

const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.get(
  '/',
  authMiddleware,
  getOrders
);

router.get(
  '/:id',
  authMiddleware,
  getOrderById
);

router.post(
  '/',
  authMiddleware,
  createOrder
);

router.put(
  '/:id/status',
  authMiddleware,
  updateOrderStatus
);

module.exports = router;