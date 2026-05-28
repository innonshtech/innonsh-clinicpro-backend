import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import * as doctorController from '@/controllers/doctorController';

// POST: /api/v1/doctor/availability
/**
 * @swagger
 * /api/v1/doctor/availability:
 *   post:
 *     summary: Set doctor daily availability
 *     description: Saves time slots for a specific doctor and date. Authorized staff and doctors only.
 *     tags: [Doctor]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - doctor_id
 *               - date
 *               - available_slots
 *             properties:
 *               doctor_id:
 *                 type: string
 *               date:
 *                 type: string
 *                 format: date
 *                 example: "2026-04-14"
 *               available_slots:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["09:00 AM", "10:00 AM", "11:00 AM"]
 *     responses:
 *       201:
 *         description: Availability saved successfully
 *       400:
 *         description: Validation failed or duplicate slots
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Role not allowed)
 */
export const POST = withErrorHandler(
  withRoles(['admin', 'receptionist', 'doctor'], async (req) => {
    // Standardize input for the controller (available_slots -> availableSlots)
    const body = await req.clone().json();
    if (body.available_slots && !body.availableSlots) {
      body.availableSlots = body.available_slots;
    }
    // Note: Since I already use req.json() inside the controller, 
    // I should be careful. I'll pass the standardized body if needed, 
    // or just let the service handle it as I did.
    return await doctorController.setAvailability(req);
  })
);

export const GET = withErrorHandler(
  withRoles(['admin', 'receptionist', 'doctor'], async (req) => {
    return await doctorController.getAvailability(req);
  })
);
