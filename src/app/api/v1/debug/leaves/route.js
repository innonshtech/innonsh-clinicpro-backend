import { ApiResponse } from '@/utils/apiResponse';
import Leave from '@/models/Leave';
import dbConnect from '@/utils/db';

export async function GET() {
  await dbConnect();
  const leaves = await Leave.find({});
  return ApiResponse.success({ leaves });
}
