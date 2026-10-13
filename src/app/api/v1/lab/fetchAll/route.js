import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';

/**
 * @swagger
 * /api/v1/lab/fetchAll:
 *   get:
 *     summary: Fetch all registered laboratories (Admin only)
 *     tags: [Lab]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of laboratories
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Admin only)
 */
export const GET = withErrorHandler(
  withRoles(['admin'], async () => {
    const { data: labsData, error } = await supabase
      .from('labs')
      .select('id, lab_name, lab_type, description, logo, phone, email, login_email, website, address, city, state, postal_code, country, registration_number, tax_id, license_document_url, nabl_accredited, home_collection_available, operating_hours, role, status, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[LAB FETCHALL ERROR] Supabase error:', error);
      throw error;
    }

    const enrichedLabs = (labsData || []).map(lab => {
      const safe = {
        ...lab,
        _id: lab.id,
        labName: lab.lab_name,
        labType: lab.lab_type,
        loginEmail: lab.login_email,
        contactEmail: lab.email,
        postalCode: lab.postal_code,
        registrationNumber: lab.registration_number,
        taxId: lab.tax_id,
        licenseDocumentUrl: lab.license_document_url,
        nablAccredited: lab.nabl_accredited,
        homeCollectionAvailable: lab.home_collection_available,
        operatingHours: lab.operating_hours,
        createdAt: lab.created_at,
        updatedAt: lab.updated_at
      };
      delete safe.password;
      return safe;
    });

    return ApiResponse.success({ labs: enrichedLabs });
  })
);
