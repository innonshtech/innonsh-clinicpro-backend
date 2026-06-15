import { supabase } from '@/lib/supabase';

class QueryBuilder {
  constructor(table, query = {}) {
    this.table = table;
    this.query = query;
    this.selectStr = '*';
    this.sortObj = null;
    this.limitNum = null;
    this.skipNum = null;
    this.populateArr = [];
  }

  select(fields) {
    if (typeof fields === 'string') {
      const keys = fields.split(' ');
      const include = keys.filter(k => !k.startsWith('-'));
      // Supabase doesn't easily support excluding fields dynamically unless explicitly specified,
      // so we'll just ignore exclusions and fetch '*' or the specific includes.
      if (include.length > 0) {
        this.selectStr = include.join(',');
      }
    }
    return this;
  }

  sort(sortObj) {
    this.sortObj = sortObj;
    return this;
  }

  limit(num) {
    this.limitNum = num;
    return this;
  }

  skip(num) {
    this.skipNum = num;
    return this;
  }

  populate(field, select) {
    // Basic mapping for Supabase foreign keys
    this.populateArr.push(field);
    return this;
  }

  async exec() {
    let req = supabase.from(this.table).select(this.selectStr);

    // Basic query mapping
    for (const [key, value] of Object.entries(this.query)) {
      if (key === '$or') {
        const orConditions = value.map(cond => {
          const k = Object.keys(cond)[0];
          const v = cond[k];
          const dbKey = k === '_id' ? 'id' : k.replace(/([A-Z])/g, '_$1').toLowerCase();
          return `${dbKey}.eq.${v}`;
        }).join(',');
        req = req.or(orConditions);
      } else if (key === '_id') {
        req = req.eq('id', value);
      } else {
        const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        if (typeof value === 'object' && value !== null) {
           if (value.$in) req = req.in(dbKey, value.$in);
           if (value.$gte) req = req.gte(dbKey, value.$gte);
           if (value.$lte) req = req.lte(dbKey, value.$lte);
        } else {
           req = req.eq(dbKey, value);
        }
      }
    }

    if (this.sortObj) {
      for (const [key, val] of Object.entries(this.sortObj)) {
        const dbKey = key === '_id' ? 'id' : key.replace(/([A-Z])/g, '_$1').toLowerCase();
        req = req.order(dbKey, { ascending: val === 1 });
      }
    }

    if (this.limitNum) {
      const from = this.skipNum || 0;
      req = req.range(from, from + this.limitNum - 1);
    }

    const { data, error } = await req;
    if (error) throw error;
    
    // Mimic mongoose document behavior
    if (data) {
       data.forEach(d => {
         d._id = d.id;
         d.toObject = () => d;
       });
    }
    
    return data;
  }

  async then(resolve, reject) {
    try {
      const result = await this.exec();
      resolve(result);
    } catch (err) {
      reject(err);
    }
  }
}

export default class BaseRepository {
  constructor(tableName) {
    this.tableName = tableName;
  }

  find(query = {}) {
    return new QueryBuilder(this.tableName, query);
  }

  findOne(query = {}) {
    const builder = new QueryBuilder(this.tableName, query);
    const originalExec = builder.exec.bind(builder);
    builder.exec = async () => {
      builder.limit(1);
      const data = await originalExec();
      return data && data.length > 0 ? data[0] : null;
    };
    return builder;
  }

  async create(data) {
    // Map camelCase to snake_case
    const mappedData = {};
    for (const [key, value] of Object.entries(data)) {
       const dbKey = key === '_id' ? 'id' : key.replace(/([A-Z])/g, '_$1').toLowerCase();
       mappedData[dbKey] = value;
    }

    const { data: result, error } = await supabase
      .from(this.tableName)
      .insert([mappedData])
      .select()
      .single();
    if (error) throw error;
    
    result._id = result.id;
    result.toObject = () => result;
    return result;
  }

  async findByIdAndUpdate(id, updateData, options) {
    const mappedData = {};
    const set = updateData.$set || updateData;
    for (const [key, value] of Object.entries(set)) {
       if (key.startsWith('$')) continue;
       const dbKey = key === '_id' ? 'id' : key.replace(/([A-Z])/g, '_$1').toLowerCase();
       mappedData[dbKey] = value;
    }

    const { data: result, error } = await supabase
      .from(this.tableName)
      .update(mappedData)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    
    if (result) {
      result._id = result.id;
      result.toObject = () => result;
    }
    return result;
  }
  
  async deleteOne(query) {
     let req = supabase.from(this.tableName).delete();
     if (query._id) req = req.eq('id', query._id);
     else {
        // Basic mapping for delete
        for (const [key, value] of Object.entries(query)) {
           const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
           req = req.eq(dbKey, value);
        }
     }
     const { error } = await req;
     if (error) throw error;
     return { deletedCount: 1 };
  }
}
