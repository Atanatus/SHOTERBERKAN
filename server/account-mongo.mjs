// Only server-side. Importing this module does NOT initialize a MongoDB connection.
export function mongoAccountStore(collection) {
  if (!collection || typeof collection.findOneAndUpdate !== 'function') throw new TypeError('MongoDB collection required');
  return Object.freeze({
    async getOrCreate(uid, defaults) {
      // Unique MongoDB _id: concurrent first logins can only create one account.
      // No request-body fields are written; XP, age, permissions and rank never originate in a browser.
      if (defaults?._id !== uid) throw new TypeError('Identificador inconsistente');
      const {_id, ...insertDefaults} = defaults;
      const record = await collection.findOneAndUpdate(
        {_id: uid}, {$setOnInsert: insertDefaults},
        {upsert: true, returnDocument: 'after'}
      );
      if (!record) throw new Error('Cuenta no recuperada');
      return record;
    }
  });
}
