import { registerPatient } from '../patientService';
import Patient from '@/models/Patient';
import bcrypt from 'bcryptjs';

jest.mock('@/models/Patient');
jest.mock('bcryptjs');

describe('Patient Service - registerPatient', () => {
  const mockPatientData = {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phoneNumber: '1234567890',
    password: 'Password123!',
    dateOfBirth: '1990-01-01',
    gender: 'Male'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should register a patient successfully', async () => {
    // Arrange
    Patient.findOne.mockResolvedValue(null);
    bcrypt.hash.mockResolvedValue('hashed_password');
    Patient.create.mockResolvedValue({
      ...mockPatientData,
      password: 'hashed_password',
      role: 'patient',
      toObject: jest.fn().mockReturnValue({ 
        firstName: 'John', 
        lastName: 'Doe' 
      })
    });

    // Act
    const result = await registerPatient(mockPatientData);

    // Assert
    expect(Patient.findOne).toHaveBeenCalledWith({
      $or: [
        { email: mockPatientData.email },
        { phoneNumber: mockPatientData.phoneNumber }
      ]
    });
    expect(bcrypt.hash).toHaveBeenCalledWith(mockPatientData.password, 12);
    expect(Patient.create).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it('should throw an error if email already exists', async () => {
    // Arrange
    Patient.findOne.mockResolvedValue({ email: mockPatientData.email });

    // Act & Assert
    await expect(registerPatient(mockPatientData))
      .rejects.toThrow('Email already registered');
  });

  it('should throw an error if phone number already exists', async () => {
    // Arrange
    Patient.findOne.mockResolvedValue({ phoneNumber: mockPatientData.phoneNumber });

    // Act & Assert
    await expect(registerPatient(mockPatientData))
      .rejects.toThrow('Phone number already registered');
  });
});
