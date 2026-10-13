import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { ipdService } from '@/services/ipdService';

export const GET = withErrorHandler(
  withRoles(['clinic', 'admin', 'doctor'], async (req) => {
    const { searchParams } = new URL(req.url);
    const clinicId = searchParams.get('clinicId') || req.user?.clinicId;

    if (!clinicId) {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    if (req.user?.role === 'clinic' && req.user?.clinicId !== clinicId) {
      return ApiResponse.error('Forbidden: Cross-clinic access prohibited', 'FORBIDDEN', [], 403);
    }

    try {
      const hierarchy = await ipdService.getHierarchy(clinicId);
      return ApiResponse.success({ hierarchy }, 'IPD hospital hierarchy fetched successfully');
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ERROR', [], err.statusCode || 400);
    }
  })
);

export const POST = withErrorHandler(
  withRoles(['clinic', 'admin'], async (req) => {
    let body;
    try { body = await req.json(); } catch (e) {
      return ApiResponse.error('Invalid JSON body', 'BAD_REQUEST', [], 400);
    }

    const clinicId = body.clinicId || req.user?.clinicId;
    if (!clinicId) {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    if (req.user?.role === 'clinic' && req.user?.clinicId !== clinicId) {
      return ApiResponse.error('Forbidden: Cross-clinic access prohibited', 'FORBIDDEN', [], 403);
    }

    const { entityType, data } = body; // building, floor, ward, room, bed

    try {
      let created;
      if (entityType === 'building') {
        created = await ipdService.createBuilding(clinicId, data);
      } else if (entityType === 'floor') {
        created = await ipdService.createFloor(clinicId, data);
      } else if (entityType === 'ward') {
        created = await ipdService.createWard(clinicId, data);
      } else if (entityType === 'room') {
        created = await ipdService.createRoom(clinicId, data);
      } else if (entityType === 'bed') {
        created = await ipdService.createBed(clinicId, data, req.user);
      } else {
        return ApiResponse.error('Invalid entityType. Must be building, floor, ward, room, or bed', 'BAD_REQUEST', [], 400);
      }

      return ApiResponse.success({ created }, entityType + ' created successfully', 201);
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ERROR', [], err.statusCode || 400);
    }
  })
);

export const PUT = withErrorHandler(
  withRoles(['clinic', 'admin'], async (req) => {
    let body;
    try { body = await req.json(); } catch (e) {
      return ApiResponse.error('Invalid JSON body', 'BAD_REQUEST', [], 400);
    }

    const clinicId = body.clinicId || req.user?.clinicId;
    if (!clinicId) {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    if (req.user?.role === 'clinic' && req.user?.clinicId !== clinicId) {
      return ApiResponse.error('Forbidden: Cross-clinic access prohibited', 'FORBIDDEN', [], 403);
    }

    const { entityType, id, data } = body;
    if (!entityType || !id || !data) {
      return ApiResponse.error('entityType, id, and data are required for update', 'MISSING_FIELD', [], 400);
    }

    try {
      const updated = await ipdService.updateEntity(clinicId, entityType, id, data);
      return ApiResponse.success({ updated }, entityType + ' updated successfully');
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'UPDATE_FAILED', [], err.statusCode || 400);
    }
  })
);

export const PATCH = withErrorHandler(
  withRoles(['clinic', 'admin'], async (req) => {
    let body;
    try { body = await req.json(); } catch (e) {
      return ApiResponse.error('Invalid JSON body', 'BAD_REQUEST', [], 400);
    }

    const clinicId = body.clinicId || req.user?.clinicId;
    if (!clinicId) {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    if (req.user?.role === 'clinic' && req.user?.clinicId !== clinicId) {
      return ApiResponse.error('Forbidden: Cross-clinic access prohibited', 'FORBIDDEN', [], 403);
    }

    const { entityType, id, action } = body;
    if (!entityType || !id) {
      return ApiResponse.error('entityType and id are required for status change', 'MISSING_FIELD', [], 400);
    }

    try {
      const result = await ipdService.deactivateEntity(clinicId, entityType, id, action || 'deactivate', req.user);
      const actionMsg = action === 'activate' ? 'reactivated' : 'safely deactivated';
      return ApiResponse.success({ result }, entityType + ' ' + actionMsg);
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ACTION_FAILED', [], err.statusCode || 400);
    }
  })
);

export const DELETE = withErrorHandler(
  withRoles(['clinic', 'admin'], async (req) => {
    let body = {};
    try {
      body = await req.json();
    } catch (_) {
      const { searchParams } = new URL(req.url);
      body = {
        clinicId: searchParams.get('clinicId'),
        entityType: searchParams.get('entityType'),
        id: searchParams.get('id')
      };
    }

    const clinicId = body.clinicId || req.user?.clinicId;
    if (!clinicId) {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    if (req.user?.role === 'clinic' && req.user?.clinicId !== clinicId) {
      return ApiResponse.error('Forbidden: Cross-clinic access prohibited', 'FORBIDDEN', [], 403);
    }

    const { entityType, id } = body;
    if (!entityType || !id) {
      return ApiResponse.error('entityType and id are required for deletion', 'MISSING_FIELD', [], 400);
    }

    try {
      const result = await ipdService.deleteEntity(clinicId, entityType, id);
      return ApiResponse.success({ result }, result.message);
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'DELETION_FAILED', [], err.statusCode || 400);
    }
  })
);
