import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data: doctors, error } = await supabase.from('doctors').select('*');
  if (error) {
    return ApiResponse.error(error.message, 'DB_ERROR', [], 500);
  }
  const debugInfo = doctors.map(doc => ({
    name: `${doc.first_name} ${doc.last_name}`,
    clinicId: doc.clinic_id,
    available: doc.available,
    availableDays: doc.available_days,
    sessionTime: doc.session_time
  }));
  return ApiResponse.success({ doctors: debugInfo });
}
