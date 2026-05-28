import { searchPatients } from '../patientService';
import Patient from '@/models/Patient';
import Doctor from '@/models/Doctor';
import Appointment from '@/models/Appointments';

jest.mock('@/models/Patient');
jest.mock('@/models/Doctor');
jest.mock('@/models/Appointments');

describe('Patient Service - searchPatients', () => {
  const mockUser = {
    id: 'doctor123',
    role: 'doctor',
    clinicId: 'clinic456'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should search patients with clinic scoping for a single doctor clinic', async () => {
    // Arrange
    Doctor.countDocuments.mockResolvedValue(1); // Single doctor clinic
    Patient.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue([
        { firstName: 'John', lastName: 'Doe', patientId: 'p1' }
      ])
    });

    // Act
    const result = await searchPatients(mockUser, { query: 'John', limit: 10 });

    // Assert
    expect(Doctor.countDocuments).toHaveBeenCalledWith({ clinicId: 'clinic456' });
    expect(Patient.find).toHaveBeenCalledWith(expect.objectContaining({
      clinicId: 'clinic456',
      $or: expect.any(Array)
    }));
    expect(result.patients).toHaveLength(1);
    expect(result.patients[0].firstName).toBe('John');
  });

  it('should search only assigned patients for a multi-doctor clinic', async () => {
    // Arrange
    Doctor.countDocuments.mockResolvedValue(2); // Multi-doctor clinic
    Appointment.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([{ patientId: 'p1' }, { patientId: 'p2' }])
    });
    Patient.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue([
        { firstName: 'John', lastName: 'Doe', patientId: 'p1' }
      ])
    });

    // Act
    const result = await searchPatients(mockUser, { query: 'John', limit: 10 });

    // Assert
    expect(Appointment.find).toHaveBeenCalledWith({ doctorId: 'doctor123' });
    expect(Patient.find).toHaveBeenCalledWith(expect.objectContaining({
      patientId: { $in: ['p1', 'p2'] }
    }));
  });

  it('should allow receptionists to search all patients in their clinic', async () => {
    // Arrange
    const receptionistUser = { role: 'receptionist', clinicId: 'clinic456' };
    Patient.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue([])
    });

    // Act
    await searchPatients(receptionistUser, { query: 'test', limit: 10 });

    // Assert
    expect(Patient.find).toHaveBeenCalledWith(expect.objectContaining({
      clinicId: 'clinic456'
    }));
  });
});
