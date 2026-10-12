/**
 * Customer Module Routes
 * ReviewAI SaaS Platform
 */

import { Router } from 'express';
import { CustomerController } from './controller';
import { AuthMiddleware } from '../auth/middleware';

export function createCustomerRoutes(
  controller: CustomerController,
  authMiddleware: AuthMiddleware
): Router {
  const router = Router();

  // All customer routes require authentication
  router.use(authMiddleware.authenticate);

  // Business-specific paths
  router.get('/businesses/:businessId/customers', controller.listCustomers);
  router.post('/businesses/:businessId/customers', controller.createCustomer);
  router.get('/businesses/:businessId/customers/:id', controller.getCustomer);
  router.patch('/businesses/:businessId/customers/:id', controller.updateCustomer);
  router.delete('/businesses/:businessId/customers/:id', controller.deleteCustomer);
  router.post('/businesses/:businessId/customers/:id/toggle-status', controller.toggleStatus);

  // Direct paths (resolving active businessId)
  router.get('/customers', controller.listCustomers);
  router.post('/customers', controller.createCustomer);
  router.get('/customers/:id', controller.getCustomer);
  router.patch('/customers/:id', controller.updateCustomer);
  router.delete('/customers/:id', controller.deleteCustomer);
  router.post('/customers/:id/toggle-status', controller.toggleStatus);

  return router;
}
