import BaseRepository from './BaseRepository';

class DoctorRepository extends BaseRepository {
  constructor() {
    super('doctors');
  }
}

export default new DoctorRepository();
