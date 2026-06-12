import { NextResponse } from 'next/server';
import { validateUpload } from '@/lib/upload-validator';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json(
        { success: false, message: 'No file provided in form data.' },
        { status: 400 }
      );
    }

    // Call the centralized upload validation utility
    const validation = validateUpload(file);

    if (!validation.isValid) {
      // Return standardized error response for blocked uploads
      return NextResponse.json(
        { success: false, message: validation.error },
        { status: 400 }
      );
    }

    // File is valid.
    // At this point, you would typically convert the file to a buffer and upload it to an S3 bucket or save it locally.
    // For this debug route, we just acknowledge the successful validation.

    return NextResponse.json(
      { 
        success: true, 
        message: 'File validated successfully.',
        details: {
          originalName: file.name,
          sanitizedName: validation.sanitizedName,
          size: file.size,
          type: file.type
        }
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Upload Error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error during upload.' },
      { status: 500 }
    );
  }
}
