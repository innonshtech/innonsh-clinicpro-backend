import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';

export async function GET() {
  const { data: leaves, error } = await supabase.from('leaves').select('*');
  if (error) {
    return ApiResponse.error(error.message, 'DB_ERROR', [], 500);
  }
  return ApiResponse.success({ leaves });
}
