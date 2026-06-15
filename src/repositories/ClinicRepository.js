import BaseRepository from './BaseRepository';

class ClinicRepository extends BaseRepository {
  constructor() {
    super('clinics');
  }
}

export default new ClinicRepository();
