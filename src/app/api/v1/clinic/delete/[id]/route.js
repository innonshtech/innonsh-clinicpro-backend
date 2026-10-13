import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * DELETE /api/v1/clinic/delete/[id]
 * Safely deletes a clinic after inspecting dependencies (doctors, patients, appointments, lab orders).
 */
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ success: false, message: 'Clinic ID is required' }, { status: 400 });
    }

    // 1. Check if clinic exists
    const { data: clinic, error: fetchErr } = await supabase
      .from('clinics')
      .select('id, clinic_name')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ success: false, message: fetchErr.message }, { status: 500 });
    }

    if (!clinic) {
      return NextResponse.json({ success: false, message: 'Clinic not found' }, { status: 404 });
    }

    // 2. Inspect dependencies to prevent foreign key errors / data corruption
    const [docs, patients, appts, orders] = await Promise.all([
      supabase.from('doctors').select('id', { count: 'exact', head: true }).eq('clinic_id', id),
      supabase.from('patients').select('id', { count: 'exact', head: true }).eq('clinic_id', id),
      supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('clinic_id', id),
      supabase.from('lab_orders').select('id', { count: 'exact', head: true }).eq('clinic_id', id)
    ]);

    const reasons = [];
    if (docs.count > 0) reasons.push(`${docs.count} assigned doctor(s)`);
    if (patients.count > 0) reasons.push(`${patients.count} patient record(s)`);
    if (appts.count > 0) reasons.push(`${appts.count} appointment(s)`);
    if (orders.count > 0) reasons.push(`${orders.count} lab order(s)`);

    if (reasons.length > 0) {
      return NextResponse.json({
        success: false,
        message: `Cannot delete clinic because it has associated ${reasons.join(', ')}. Please reassign or remove these records first to prevent data corruption.`
      }, { status: 400 });
    }

    // 3. Safe deletion from clinics table
    const { error: deleteErr } = await supabase
      .from('clinics')
      .delete()
      .eq('id', id);

    if (deleteErr) {
      return NextResponse.json({ success: false, message: deleteErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Clinic "${clinic.clinic_name}" has been deleted successfully.`
    });
  } catch (err) {
    console.error('[CLINIC DELETE API ERROR]:', err);
    return NextResponse.json({ success: false, message: err.message || 'Internal server error' }, { status: 500 });
  }
}
