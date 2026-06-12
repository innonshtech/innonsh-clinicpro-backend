import { requestContext } from './asyncContext';
import AuditLog from '../models/AuditLog';

/**
 * Global Mongoose plugin to automatically capture Administrative mutations
 * and log the exact changes (Old Value / New Value) to the AuditLog.
 */
export default function auditPlugin(schema, options) {
  const isAuditable = (ctx, modelName) => {
    return ctx && ctx.userRole === 'admin' && modelName !== 'AuditLog';
  };

  // ==========================================
  // 1. UPDATE Operations
  // ==========================================
  const updateMethods = ['findOneAndUpdate', 'updateOne', 'updateMany'];

  schema.pre(updateMethods, async function () {
    const ctx = requestContext.getStore();
    if (isAuditable(ctx, this.model.modelName) && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(ctx.method)) {
      this._auditContext = ctx;
      // Fetch the state of the documents BEFORE the update
      this._originalDocs = await this.model.find(this.getQuery()).lean();
    }
  });

  schema.post(updateMethods, async function (result) {
    if (this._auditContext && this._originalDocs && this._originalDocs.length > 0) {
      // Fetch the state of the documents AFTER the update
      const newDocs = await this.model.find(this.getQuery()).lean();

      for (const oldDoc of this._originalDocs) {
        const newDoc = newDocs.find((d) => d._id.toString() === oldDoc._id.toString());
        if (newDoc) {
          await AuditLog.create({
            userId: this._auditContext.userId,
            userRole: this._auditContext.userRole,
            action: 'UPDATE',
            resourceType: this.model.modelName,
            resourceId: oldDoc._id.toString(),
            clinicId: oldDoc.clinicId || 'system',
            changes: { before: oldDoc, after: newDoc },
            metadata: { ipAddress: this._auditContext.ipAddress, url: this._auditContext.url, method: this._auditContext.method }
          });
        }
      }
    }
  });

  // ==========================================
  // 2. DELETE Operations
  // ==========================================
  const deleteMethods = ['findOneAndDelete', 'deleteOne', 'deleteMany', 'findByIdAndDelete'];

  schema.pre(deleteMethods, async function () {
    const ctx = requestContext.getStore();
    if (isAuditable(ctx, this.model.modelName)) {
      this._auditContext = ctx;
      this._originalDocs = await this.model.find(this.getQuery()).lean();
    }
  });

  schema.post(deleteMethods, async function () {
    if (this._auditContext && this._originalDocs) {
      for (const oldDoc of this._originalDocs) {
        await AuditLog.create({
          userId: this._auditContext.userId,
          userRole: this._auditContext.userRole,
          action: 'DELETE',
          resourceType: this.model.modelName,
          resourceId: oldDoc._id.toString(),
          clinicId: oldDoc.clinicId || 'system',
          changes: { before: oldDoc, after: null },
          metadata: { ipAddress: this._auditContext.ipAddress, url: this._auditContext.url, method: this._auditContext.method }
        });
      }
    }
  });

  // ==========================================
  // 3. SAVE Operations (Create / Update via Document.save())
  // ==========================================
  schema.pre('save', async function () {
    const ctx = requestContext.getStore();
    if (isAuditable(ctx, this.constructor.modelName)) {
      this._auditContext = ctx;
      this._isNewRecord = this.isNew;
      if (!this.isNew) {
        // Fetch original document from DB before it's overwritten
        this._originalDoc = await this.constructor.findById(this._id).lean();
      }
    }
  });

  schema.post('save', async function (doc) {
    if (this._auditContext) {
      await AuditLog.create({
        userId: this._auditContext.userId,
        userRole: this._auditContext.userRole,
        action: this._isNewRecord ? 'CREATE' : 'UPDATE',
        resourceType: this.constructor.modelName,
        resourceId: doc._id.toString(),
        clinicId: doc.clinicId || 'system',
        changes: {
          before: this._isNewRecord ? null : this._originalDoc,
          after: doc.toObject()
        },
        metadata: { ipAddress: this._auditContext.ipAddress, url: this._auditContext.url, method: this._auditContext.method }
      });
    }
  });
}
