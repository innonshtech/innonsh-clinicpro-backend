import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * DELETE /api/v1/lab/delete/[id]
 * Safely deletes a laboratory after inspecting dependencies (lab orders, test packages, tests).
 */
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, message: 'Laboratory ID is required' }, { status: 400 });
    }

    // 1. Check if lab exists
    const { data: lab, error: fetchErr } = await supabase
      .from('labs')
      .select('id, lab_name')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ success: false, message: fetchErr.message }, { status: 500 });
    }

    if (!lab) {
      return NextResponse.json({ success: false, message: 'Laboratory not found' }, { status: 404 });
    }

    // 2. Check lab orders dependency to avoid breaking order history
    const { count: orderCount, error: orderErr } = await supabase
      .from('lab_orders')
      .select('id', { count: 'exact', head: true })
      .eq('lab_id', id);

    if (orderErr) {
      console.warn('Could not check lab_orders:', orderErr.message);
    } else if (orderCount > 0) {
      return NextResponse.json({
        success: false,
        message: `Cannot delete laboratory because it has ${orderCount} existing lab order(s). Active orders must be completed or archived first to prevent data corruption.`
      }, { status: 400 });
    }

    // 3. Clean up associated test package items, packages, and tests if any
    try {
      const { data: packages } = await supabase
        .from('lab_test_packages')
        .select('id')
        .eq('lab_id', id);

      if (packages && packages.length > 0) {
        const pkgIds = packages.map(p => p.id);
        await supabase
          .from('lab_test_package_items')
          .delete()
          .in('package_id', pkgIds);

        await supabase
          .from('lab_test_packages')
          .delete()
          .eq('lab_id', id);
      }

      await supabase
        .from('lab_tests')
        .delete()
        .eq('lab_id', id);
    } catch (cleanErr) {
      console.warn('Warning during associated test clean up:', cleanErr.message);
    }

    // 4. Safe deletion of the laboratory record
    const { error: deleteErr } = await supabase
      .from('labs')
      .delete()
      .eq('id', id);

    if (deleteErr) {
      return NextResponse.json({ success: false, message: deleteErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Laboratory "${lab.lab_name}" has been deleted successfully.`
    });
  } catch (err) {
    console.error('[LAB DELETE API ERROR]:', err);
    return NextResponse.json({ success: false, message: err.message || 'Internal server error' }, { status: 500 });
  }
}
